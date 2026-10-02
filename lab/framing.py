# Local-only debug lab (#198). Run: docker compose --profile lab up --build lab
import base64

import cv2
import httpx
import numpy as np
import streamlit as st

from app import scrape_games

KNOBS = {
    "FACE_SHARE": (0.2, 1.0, 0.05),
    "MAX_ZOOM": (1.0, 5.0, 0.1),
    "HAIR_SHIFT": (0.0, 0.5, 0.01),
}
COLUMNS = {"Photo": 1, "Focus": 1, "With focus": 2, "Without focus": 2}
PHOTO_WIDTH = 160


@st.cache_resource
def prod_defaults() -> dict[str, float]:
    # First call runs before any slider patches the module, so these are the shipped values.
    return {name: float(getattr(scrape_games, name)) for name in KNOBS}


def reset_knobs() -> None:
    st.session_state.update(prod_defaults())


@st.cache_data
def fetch(url: str) -> bytes:
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def circles(uri: str, style: str) -> str:
    return (
        '<div style="display:flex;gap:16px;align-items:center">'
        + "".join(
            f'<div style="width:{s}px;height:{s}px;border-radius:50%;overflow:hidden;background:#ddd;flex:none">'
            f'<img src="{uri}" style="width:100%;height:100%;object-fit:cover;{style}"></div>'
            for s in (44, 56, 80, 96)
        )
        + "</div>"
    )


def show_row(name: str, data: bytes) -> None:
    photo, info, with_focus, without_focus = st.columns(
        list(COLUMNS.values()), vertical_alignment="center"
    )
    color = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if color is None:
        info.error(f"Could not decode {name}")
        return

    x, y, zoom = scrape_games.face_focus(data)
    uri = (
        "data:image/png;base64,"
        + base64.b64encode(cv2.imencode(".png", color)[1].tobytes()).decode()
    )
    face = scrape_games._largest_face(
        cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE)
    )
    if face is not None:
        fx, fy, fw, fh = face
        cv2.rectangle(
            color, (fx, fy), (fx + fw, fy + fh), (0, 255, 0), max(2, color.shape[1] // 200)
        )

    photo.image(color, channels="BGR", width=PHOTO_WIDTH)
    info.markdown(f"`{name}`  \nx **{x:.1f}%** · y **{y:.1f}%** · zoom **{zoom:.2f}x**")
    if face is None:
        info.warning("No face detected — top-anchored default")
    # mirrors focusStyle() in frontend/src/components/PlayerCard.vue
    with_focus.html(
        circles(
            uri, f"object-position:{x}% {y}%;transform-origin:{x}% {y}%;transform:scale({zoom})"
        )
    )
    without_focus.html(circles(uri, "object-position:top"))


st.set_page_config(page_title="Gush Ball lab", layout="wide")
st.title("Player avatar framing")

for name, (lo, hi, step) in KNOBS.items():
    st.session_state.setdefault(name, prod_defaults()[name])
    # ponytail: patches module knobs in-process; fine for a single-user local lab
    setattr(
        scrape_games,
        name,
        st.sidebar.slider(name, lo, hi, step=step, key=name, help=f"prod: {prod_defaults()[name]}"),
    )
st.sidebar.button("Reset to prod defaults", on_click=reset_knobs)
st.sidebar.code("\n".join(f"{name} = {getattr(scrape_games, name)}" for name in KNOBS))

uploads = st.file_uploader(
    "Photos", type=["jpg", "jpeg", "png", "webp"], accept_multiple_files=True
)
images = [(upload.name, upload.getvalue()) for upload in uploads]
for url in st.text_area("...or image URLs, one per line").split():
    try:
        images.append((url, fetch(url)))
    except httpx.HTTPError as exc:
        st.error(f"Could not fetch {url}: {exc}")
if not images:
    st.info("Upload photos or paste image URLs")
    st.stop()

for col, title in zip(st.columns(list(COLUMNS.values())), COLUMNS):
    col.markdown(f"**{title}**")
for name, data in images:
    show_row(name, data)
