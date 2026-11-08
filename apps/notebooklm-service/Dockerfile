FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOME=/home/service NOTEBOOKLM_HOME=/auth
WORKDIR /service
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    mkdir -p /state /auth /home/service && chown -R 10001:10001 /state /auth /home/service
COPY app.py notebook.py network.py main.py ./
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import os,urllib.request; r=urllib.request.Request('http://127.0.0.1:8000/health',headers={'Authorization':'Bearer '+os.environ['SUMMARY_NOTEBOOKLM_TOKEN']}); urllib.request.urlopen(r,timeout=3)"
CMD ["uvicorn", "main:make_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
