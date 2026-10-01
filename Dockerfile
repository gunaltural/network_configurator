FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py report_docx.py inventory_excel.py web.html reporting.html engineering-locale.js ./
CMD ["python", "app.py"]
