FROM python:3.12-slim
WORKDIR /opt/camp
COPY pyproject.toml ./
COPY camp/ ./camp/
RUN pip install .
CMD ["camp", "--help"]
