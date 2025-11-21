import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

WebBrowser.maybeCompleteAuthSession();

interface AuthResult {
  success: boolean;
  apiKey?: string;
  apiKeyId?: string;
  error?: string;
}

/**
 * Opens the web app's authentication page in an in-app browser.
 * After successful authentication, the web app will redirect to karakeep://auth-callback
 * with the API key and key ID.
 *
 * @param serverAddress The server address (e.g., https://cloud.karakeep.app)
 * @returns An AuthResult object with the API key and key ID, or an error
 */
export async function authenticateWithBrowser(
  serverAddress: string,
): Promise<AuthResult> {
  try {
    // Construct the mobile auth URL
    const authUrl = new URL("/mobile-auth", serverAddress);
    authUrl.searchParams.set("keyName", "Mobile App");

    // Define the redirect URL for the callback
    const redirectUrl = Linking.createURL("auth-callback");

    // Open the auth page in an in-app browser
    const result = await WebBrowser.openAuthSessionAsync(
      authUrl.toString(),
      redirectUrl,
    );

    if (result.type === "success") {
      // Parse the callback URL to extract the API key
      const url = new URL(result.url);
      const apiKey = url.searchParams.get("apiKey");
      const apiKeyId = url.searchParams.get("apiKeyId");

      if (!apiKey || !apiKeyId) {
        return {
          success: false,
          error: "Authentication succeeded but no API key was returned",
        };
      }

      return {
        success: true,
        apiKey,
        apiKeyId,
      };
    } else if (result.type === "cancel") {
      return {
        success: false,
        error: "Authentication was cancelled",
      };
    } else {
      return {
        success: false,
        error: "Authentication failed",
      };
    }
  } catch (error) {
    console.error("Browser auth error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred",
    };
  }
}
