# Self-hosted MinerU document parser for the classroom (PDF/Office -> markdown).
# Pinned to 3.4.x: MinerU 4.x ships as a CUDA/vLLM image only, and 3.4 still
# serves the /file_parse endpoint lib/pdf/pdf-providers.ts calls while parsing
# on CPU with the pipeline backend.
FROM python:3.12-slim

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1

# libgl/libglib are the OpenCV runtime MinerU's layout models need; the CJK
# fonts keep rendered pages legible for Chinese source material.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1 \
      fonts-noto-cjk curl \
 && rm -rf /var/lib/apt/lists/*

RUN pip install "mineru[core]==3.4.5"

# Where the layout/OCR models come from. 3.4 rejects the value `auto` at parse
# time ("MINERU_MODEL_SOURCE=auto is not supported" — the auto detection is the
# *unset* path), and an unset variable only resolves once and writes its choice
# back, so the source is pinned instead. Set after the pip layer so changing it
# does not re-download torch.
ENV MINERU_MODEL_SOURCE=huggingface

# Models download on the first parse and cache under /root/.cache/mineru.
VOLUME ["/root/.cache"]

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8000/docs >/dev/null || exit 1

CMD ["mineru-api", "--host", "0.0.0.0", "--port", "8000"]
