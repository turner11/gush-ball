# Local-only debug lab (#198). Run: docker compose --profile lab up --build lab
import base64

import cv2
import httpx
import numpy as np
import streamlit as st

from app import scrape_games

st.set_page_config(page_title="Gush Ball lab", layout="wide")
st.title("Player avatar framing")

upload = st.file_uploader("Photo", type=["jpg", "jpeg", "png", "webp"])
url = st.text_input("...or image URL")
if upload:
    data = upload.getvalue()
elif url:
    try:
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        st.error(f"Could not fetch {url}: {exc}")
        st.stop()
    data = resp.content
else:
    st.info("Upload a photo or paste an image URL")
    st.stop()

# ponytail: patches module knobs in-process; fine for a single-user local lab
scrape_games.FACE_SHARE = st.sidebar.slider("FACE_SHARE", 0.2, 1.0, scrape_games.FACE_SHARE, 0.05)
scrape_games.MAX_ZOOM = st.sidebar.slider("MAX_ZOOM", 1.0, 5.0, scrape_games.MAX_ZOOM, 0.1)
scrape_games.HAIR_SHIFT = st.sidebar.slider("HAIR_SHIFT", 0.0, 0.5, scrape_games.HAIR_SHIFT, 0.01)
st.sidebar.code(
    f"FACE_SHARE = {scrape_games.FACE_SHARE}\nMAX_ZOOM = {scrape_games.MAX_ZOOM}\nHAIR_SHIFT = {scrape_games.HAIR_SHIFT}"
)

color = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
if color is None:
    st.error("Could not decode the image")
    st.stop()

x, y, zoom = scrape_games.face_focus(data)
col_x, col_y, col_zoom = st.columns(3)
col_x.metric("focus x", f"{x:.1f}%")
col_y.metric("focus y", f"{y:.1f}%")
col_zoom.metric("zoom", f"{zoom:.2f}x")

face = scrape_games._largest_face(cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE))
if face is None:
    st.warning("No face detected — top-anchored default (50%, 0%, 1x)")
else:
    fx, fy, fw, fh = face
    boxed = color.copy()
    cv2.rectangle(boxed, (fx, fy), (fx + fw, fy + fh), (0, 255, 0), max(2, color.shape[1] // 200))
    st.image(boxed, channels="BGR", caption="Detected face")

uri = "data:image/png;base64," + base64.b64encode(cv2.imencode(".png", color)[1].tobytes()).decode()
# mirrors focusStyle() in frontend/src/components/PlayerCard.vue
focused = f"object-position:{x}% {y}%;transform-origin:{x}% {y}%;transform:scale({zoom})"
plain = "object-position:top"


def row(title: str, style: str) -> str:
    circles = "".join(
        f'<div style="width:{s}px;height:{s}px;border-radius:50%;overflow:hidden;background:#ddd">'
        f'<img src="{uri}" style="width:100%;height:100%;object-fit:cover;{style}"></div>'
        for s in (44, 56, 80, 96)
    )
    return f'<h4>{title}</h4><div style="display:flex;gap:16px;align-items:center">{circles}</div>'


st.html(row("With focus", focused) + row("Without focus", plain))
