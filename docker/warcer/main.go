package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/CorentinB/warc"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
	"github.com/google/uuid"
)

type archiveRequest struct {
	SessionID string   `json:"sessionId"`
	URLs      []string `json:"urls"`
}

type archiveResponse struct {
	Path string `json:"path"`
}

var (
	RootContentDir string
)

func init() {
	if os.Getenv("DATA_DIR") != "" {
		RootContentDir = os.Getenv("DATA_DIR")
	} else {
		RootContentDir = "/data"
	}
}

func main() {
	http.HandleFunc("/archive", handleArchive)
	addr := ":8808"
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func handleArchive(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	raw, _ := io.ReadAll(r.Body)
	log.Printf("handleArchive raw body: %s", string(raw))
	r.Body = io.NopCloser(bytes.NewBuffer(raw))

	var req archiveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("invalid request payload: %v", err)
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.URLs == nil {
		log.Printf("invalid request payload: no URLs")
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	path, err := archiveURLs(req.URLs, req.SessionID)
	if err != nil {
		log.Printf("archiveURL error: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	log.Printf("produced archive for %s at %s", fmt.Sprintf("%v", req.URLs), path)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(archiveResponse{Path: path})
}

func archiveURLs(urls []string, sessionID string) (string, error) {
	var mu sync.Mutex
	var wg sync.WaitGroup
	warcPath := filepath.Join(RootContentDir, "warc-temp", sessionID+".warc.gz")
	if err := os.MkdirAll(filepath.Dir(warcPath), 0777); err != nil {
		return "", err
	}
	f, err := os.Create(warcPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	isGz := false

	writer, err := warc.NewWriter(
		f,
		filepath.Base(warcPath),
		"GZIP",
		"",
		isGz,
		nil,
	)
	if err != nil {
		return "", err
	}
	for _, pageURL := range urls {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			_, err := url.Parse(u)
			if err != nil {
				log.Printf("crawl error %s: %v", u, err)
				return
			}
			if err := archiveUrl(u, writer, &mu); err != nil {
				log.Printf("crawl error %s: %v", u, err)
			}
		}(pageURL)
	}
	wg.Wait()
	return warcPath, nil
}

func archiveUrl(urlInput string, writer *warc.Writer, mu *sync.Mutex) error {
	var wg sync.WaitGroup

	mu.Lock()
	if _, err := writer.WriteInfoRecord(map[string]string{
		"software": "karakeep-warcer",
		"format":   "WARC/1.1",
		"isPartOf": "karakeep",
	}); err != nil {
		mu.Unlock()
		return err
	}
	mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	allocCtx, cancelAlloc, err := remoteAllocator(ctx)
	if err != nil {
		return err
	}
	defer cancelAlloc()
	ctx, cancelBrowse := chromedp.NewContext(allocCtx)
	defer cancelBrowse()
	var finalURL string
	redirectMap := make(map[string]string)
	var documentResponse *network.Response
	var documentBody []byte
	var documentRequestID network.RequestID
	chromedp.ListenTarget(ctx, func(ev interface{}) {
		switch e := ev.(type) {
		case *network.EventRequestWillBeSent:
			if e.Request.URL == urlInput && e.RedirectResponse != nil {
				redirectMap[e.Request.URL] = e.RedirectResponse.URL
				log.Printf("Redirect detected: %s -> %s", e.Request.URL, e.RedirectResponse.URL)
			}
		}
	})

	responses := make(map[network.RequestID]*network.Response)
	chromedp.ListenTarget(ctx, func(ev interface{}) {
		switch e := ev.(type) {
		case *network.EventResponseReceived:
			responses[e.RequestID] = e.Response
			if e.Type == network.ResourceTypeDocument && e.Response.URL != "" {
				finalURL = e.Response.URL
				documentResponse = e.Response
				documentRequestID = e.RequestID
			}
		case *network.EventLoadingFinished:
			if resp, ok := responses[e.RequestID]; ok {
				wg.Add(1)
				go func(reqID network.RequestID, response *network.Response) {
					defer wg.Done()
					var body []byte
					if err := chromedp.Run(ctx, chromedp.ActionFunc(func(innerCtx context.Context) error {
						var err error
						body, err = network.GetResponseBody(reqID).Do(innerCtx)
						return err
					})); err != nil {
						log.Printf("failed to get body for %s: %v", response.URL, err)
						return
					}
					if reqID == documentRequestID {
						documentBody = body
					}

					now := time.Now().UTC().Format(time.RFC3339)
					rid := "<urn:uuid:" + uuid.NewString() + ">"
					reqRec := warc.NewRecord(os.TempDir(), false)
					reqRec.Header.Set("WARC-Type", "request")
					reqRec.Header.Set("WARC-Record-ID", rid)
					reqRec.Header.Set("WARC-Target-URI", response.URL)
					reqRec.Header.Set("WARC-Date", now)
					reqRec.Content.Write(headersToHTTP(response.RequestHeaders, response.URL))
					reqRec.Content.Seek(0, 0)
					respRec := warc.NewRecord(os.TempDir(), false)
					respRec.Header.Set("WARC-Type", "response")
					respRec.Header.Set("WARC-Record-ID", "<urn:uuid:"+uuid.NewString()+">")
					respRec.Header.Set("WARC-Concurrent-To", rid)
					respRec.Header.Set("WARC-Target-URI", response.URL)
					respRec.Header.Set("WARC-Date", now)
					respRec.Header.Set("Content-Type", "application/http; msgtype=response")
					respRec.Content.Write(buildHTTPResp(response, body))
					respRec.Content.Seek(0, 0)
					for k, v := range response.Headers {
						if strings.EqualFold(k, "content-type") {
							if ct, ok := v.(string); ok && ct != "" {
								respRec.Header.Set("Content-Type", ct)
							}
							break
						}
					}
					respRec.Content.Seek(0, 0)
					mu.Lock()
					writer.WriteRecord(reqRec)
					writer.WriteRecord(respRec)
					mu.Unlock()
					reqRec.Content.Close()
					respRec.Content.Close()
				}(e.RequestID, resp)
				delete(responses, e.RequestID)
			}
		}
	})

	if err := chromedp.Run(ctx,
		network.Enable(),
		chromedp.Navigate(urlInput),
		chromedp.Sleep(5*time.Second),
	); err != nil {
		return err
	}

	wg.Wait()
	if finalURL != "" && finalURL != urlInput && documentResponse != nil && documentBody != nil {
		// hacky trick for rewriting redirected pages for the warc viewer
		now := time.Now().UTC().Format(time.RFC3339)
		origReqID := "<urn:uuid:" + uuid.NewString() + ">"
		origReqRec := warc.NewRecord(os.TempDir(), false)
		origReqRec.Header.Set("WARC-Type", "request")
		origReqRec.Header.Set("WARC-Record-ID", origReqID)
		origReqRec.Header.Set("WARC-Target-URI", urlInput)
		origReqRec.Header.Set("WARC-Date", now)
		fakeReqHeaders := make(network.Headers)
		for k, v := range documentResponse.RequestHeaders {
			fakeReqHeaders[k] = v
		}
		origReqRec.Content.Write(headersToHTTP(fakeReqHeaders, urlInput))
		origReqRec.Content.Seek(0, 0)
		origRespRec := warc.NewRecord(os.TempDir(), false)
		origRespRec.Header.Set("WARC-Type", "response")
		origRespRec.Header.Set("WARC-Record-ID", "<urn:uuid:"+uuid.NewString()+">")
		origRespRec.Header.Set("WARC-Concurrent-To", origReqID)
		origRespRec.Header.Set("WARC-Target-URI", urlInput)
		origRespRec.Header.Set("WARC-Date", now)
		origRespRec.Header.Set("Content-Type", "application/http; msgtype=response")
		var modifiedResponse network.Response
		modifiedResponse = *documentResponse
		modifiedResponse.URL = urlInput
		modifiedResponse.Status = 301
		modifiedResponse.StatusText = "Moved Permanently"
		modifiedResponse.Headers["Location"] = finalURL
		origRespRec.Content.Write(buildHTTPResp(&modifiedResponse, documentBody))
		origRespRec.Content.Seek(0, 0)
		for k, v := range documentResponse.Headers {
			if strings.EqualFold(k, "content-type") {
				if ct, ok := v.(string); ok && ct != "" {
					origRespRec.Header.Set("Content-Type", ct)
				}
				break
			}
		}
		origRespRec.Content.Seek(0, 0)
		mu.Lock()
		writer.WriteRecord(origReqRec)
		writer.WriteRecord(origRespRec)
		mu.Unlock()
		origReqRec.Content.Close()
		origRespRec.Content.Close()
		metaRec := warc.NewRecord(os.TempDir(), false)
		metaRec.Header.Set("WARC-Type", "metadata")
		metaRec.Header.Set("WARC-Record-ID", "<urn:uuid:"+uuid.NewString()+">")
		metaRec.Header.Set("WARC-Target-URI", urlInput)
		metaRec.Header.Set("WARC-Date", now)
		metaRec.Header.Set("Content-Type", "application/warc-fields")
		var metaContent bytes.Buffer
		metaContent.WriteString(fmt.Sprintf("original-url: %s\r\n", urlInput))
		metaContent.WriteString(fmt.Sprintf("final-url: %s\r\n", finalURL))
		metaContent.WriteString("note: This URL redirects, but a copy of the content has been duplicated here for WARC viewer compatibility\r\n")
		metaRec.Content.Write(metaContent.Bytes())
		metaRec.Content.Seek(0, 0)
		mu.Lock()
		writer.WriteRecord(metaRec)
		mu.Unlock()
		metaRec.Content.Close()
	}

	return nil
}

func headersToHTTP(h network.Headers, urlStr string) []byte {
	var b bytes.Buffer
	method, _ := h[":method"].(string)
	fmt.Fprintf(&b, "%s %s HTTP/1.1\r\n", method, urlStr)
	for k, v := range h {
		if strings.HasPrefix(k, ":") {
			continue
		}
		switch vv := v.(type) {
		case string:
			fmt.Fprintf(&b, "%s: %s\r\n", k, vv)
		case []string:
			for _, s := range vv {
				fmt.Fprintf(&b, "%s: %s\r\n", k, s)
			}
		default:
			fmt.Fprintf(&b, "%s: %v\r\n", k, vv)
		}
	}
	b.WriteString("\r\n")
	return b.Bytes()
}

func buildHTTPReq(h network.Headers, rawURL string) []byte {
	var b bytes.Buffer
	meth, _ := h[":method"].(string)
	fmt.Fprintf(&b, "%s %s HTTP/1.1\r\n", meth, rawURL)
	writeHdrs(&b, h)
	return b.Bytes()
}

func buildHTTPResp(resp *network.Response, body []byte) []byte {
	var b bytes.Buffer
	fmt.Fprintf(&b, "HTTP/1.1 %d %s\r\n", int(resp.Status), resp.StatusText)
	writeHdrs(&b, resp.Headers)
	b.Write(body)
	return b.Bytes()
}

func writeHdrs(b *bytes.Buffer, h network.Headers) {
	for k, v := range h {
		if strings.HasPrefix(k, ":") {
			continue
		}
		switch vv := v.(type) {
		case string:
			fmt.Fprintf(b, "%s: %s\r\n", k, vv)
		case []string:
			for _, s := range vv {
				fmt.Fprintf(b, "%s: %s\r\n", k, s)
			}
		default:
			fmt.Fprintf(b, "%s: %v\r\n", k, vv)
		}
	}
	b.WriteString("\r\n")
}

func remoteAllocator(ctx context.Context) (context.Context, context.CancelFunc, error) {
	host := getenv("CHROME_HOST", "chrome")
	port := getenv("CHROME_PORT", "9222")
	ip := host
	if host != "127.0.0.1" && host != "localhost" {
		addrs, err := net.LookupHost(host)
		if err != nil {
			return nil, nil, fmt.Errorf("hostname lookup failed for %s: %w", host, err)
		}
		ip = addrs[0]
	}

	versionURL := fmt.Sprintf("http://%s:%s/json/version", ip, port)
	log.Printf("remoteAllocator: GET %s", versionURL)

	req, err := http.NewRequest("GET", versionURL, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Host = fmt.Sprintf("%s:%s", ip, port)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	log.Printf("remoteAllocator: status %s, body: %s", resp.Status, string(bodyBytes))

	var data struct {
		WebSocketDebuggerUrl string `json:"webSocketDebuggerUrl"`
	}
	if err := json.Unmarshal(bodyBytes, &data); err != nil {
		log.Printf("JSON decode error: %v", err)
		return nil, nil, err
	}

	allocCtx, cancel := chromedp.NewRemoteAllocator(ctx, data.WebSocketDebuggerUrl, chromedp.NoModifyURL)
	return allocCtx, cancel, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
