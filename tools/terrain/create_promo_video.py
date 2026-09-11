#!/usr/bin/env python3
"""Render a vertical promo video from the local China relief WebGL page."""

from __future__ import annotations

import argparse
import contextlib
import socket
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "output" / "china-relief-douyin-promo.mp4"
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
FONT_REGULAR = Path("/System/Library/Fonts/STHeiti Light.ttc")
FONT_BOLD = Path("/System/Library/Fonts/STHeiti Medium.ttc")

WIDTH = 1080
HEIGHT = 1920
FPS = 15


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def rounded_label(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    text_font: ImageFont.FreeTypeFont,
) -> None:
    x, y = xy
    bounds = draw.textbbox((0, 0), text, font=text_font)
    w = bounds[2] - bounds[0]
    h = bounds[3] - bounds[1]
    pad_x, pad_y = 24, 13
    draw.rounded_rectangle(
        (x, y, x + w + pad_x * 2, y + h + pad_y * 2),
        radius=8,
        fill=(29, 59, 48, 218),
        outline=(235, 240, 226, 150),
        width=2,
    )
    draw.text((x + pad_x, y + pad_y - 3), text, font=text_font, fill=(248, 247, 236, 255))


def add_overlay(frame: np.ndarray, elapsed: float, duration: float) -> np.ndarray:
    rgba = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).convert("RGBA")
    overlay = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    top_alpha = 175
    bottom_alpha = 205
    draw.rectangle((0, 0, WIDTH, 330), fill=(13, 34, 27, top_alpha))
    draw.rectangle((0, HEIGHT - 330, WIDTH, HEIGHT), fill=(13, 34, 27, bottom_alpha))

    eyebrow = font(FONT_REGULAR, 27)
    title = font(FONT_BOLD, 68)
    subtitle = font(FONT_REGULAR, 34)
    caption = font(FONT_BOLD, 47)
    cta = font(FONT_REGULAR, 31)
    url_font = font(FONT_REGULAR, 23)

    draw.text((64, 65), "中国三维地形图", font=eyebrow, fill=(208, 224, 205, 255))
    draw.text((64, 115), "把山河，捧在手心里", font=title, fill=(250, 247, 232, 255))
    draw.text((68, 220), "真实高程数据 · 可旋转 · 可缩放 · 可探索", font=subtitle, fill=(212, 226, 210, 255))

    if elapsed < 3.2:
        label = "一眼看懂中国地势：西高东低"
        number = "01"
    elif elapsed < 6.2:
        label = "滑动调节，让山脉真正“站起来”"
        number = "02"
    elif elapsed < 9.6:
        label = "世界屋脊：青藏高原"
        number = "03"
    elif elapsed < 12.8:
        label = "群山环抱：四川盆地"
        number = "04"
    elif elapsed < 16:
        label = "横贯新疆：天山山脉"
        number = "05"
    else:
        label = "每一处起伏，都可以亲手探索"
        number = "06"

    rounded_label(draw, (64, HEIGHT - 276), number, font(FONT_BOLD, 28))
    draw.text((64, HEIGHT - 200), label, font=caption, fill=(250, 247, 232, 255))
    draw.text((64, HEIGHT - 125), "打开网页，拖动地图感受 3D 山河", font=cta, fill=(211, 225, 207, 255))
    draw.text((64, HEIGHT - 72), "it-tool.eu.cc/tools/mock/china-relief/", font=url_font, fill=(164, 192, 177, 255))

    progress = max(0.0, min(1.0, elapsed / duration))
    draw.rectangle((0, HEIGHT - 8, WIDTH, HEIGHT), fill=(98, 124, 108, 180))
    draw.rectangle((0, HEIGHT - 8, int(WIDTH * progress), HEIGHT), fill=(231, 223, 181, 255))

    composed = Image.alpha_composite(rgba, overlay).convert("RGB")
    return cv2.cvtColor(np.asarray(composed), cv2.COLOR_RGB2BGR)


def wait_ready(page: Page) -> None:
    page.goto(page.url, wait_until="networkidle")
    page.locator("#status").wait_for(state="hidden", timeout=60_000)
    page.wait_for_timeout(1_000)


def set_height(page: Page, value: int) -> None:
    page.locator("#height").evaluate(
        """(element, value) => {
            element.value = String(value);
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }""",
        value,
    )


def click_place(page: Page, place: str) -> None:
    page.locator(f'.place[data-place="{place}"]').evaluate("(element) => element.click()")


def capture_frame(page: Page) -> np.ndarray:
    data = page.screenshot(type="jpeg", quality=91)
    frame = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise RuntimeError("Unable to decode browser screenshot")
    return frame


def render_segment(
    page: Page,
    writer: cv2.VideoWriter,
    elapsed: float,
    seconds: float,
    duration: float,
    height_range: tuple[int, int] | None = None,
    drag: tuple[tuple[int, int], tuple[int, int]] | None = None,
) -> float:
    frames = round(seconds * FPS)
    if drag:
        page.mouse.move(*drag[0])
        page.mouse.down()
    for index in range(frames):
        ratio = index / max(1, frames - 1)
        if height_range:
            start, end = height_range
            eased = ratio * ratio * (3 - 2 * ratio)
            set_height(page, round(start + (end - start) * eased))
        if drag:
            x = round(drag[0][0] + (drag[1][0] - drag[0][0]) * ratio)
            y = round(drag[0][1] + (drag[1][1] - drag[0][1]) * ratio)
            page.mouse.move(x, y)
        frame = add_overlay(capture_frame(page), elapsed, duration)
        writer.write(frame)
        elapsed += 1 / FPS
        page.wait_for_timeout(round(1000 / FPS))
    if drag:
        page.mouse.up()
    return elapsed


def create_video(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    port = free_port()
    server = subprocess.Popen(
        [
            "python3",
            "-m",
            "http.server",
            str(port),
            "--bind",
            "127.0.0.1",
            "--directory",
            str(ROOT / "mock_file"),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    duration = 19.0
    writer = cv2.VideoWriter(
        str(output),
        cv2.VideoWriter_fourcc(*"avc1"),
        FPS,
        (WIDTH, HEIGHT),
    )
    if not writer.isOpened():
        server.terminate()
        raise RuntimeError("OpenCV could not initialize the MP4 encoder")

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=str(CHROME),
                headless=True,
                args=[
                    "--enable-webgl",
                    "--ignore-gpu-blocklist",
                    "--use-angle=swiftshader",
                    "--hide-scrollbars",
                ],
            )
            page = browser.new_page(
                viewport={"width": WIDTH, "height": HEIGHT},
                device_scale_factor=1,
            )
            page.goto(f"http://127.0.0.1:{port}/china-relief/")
            wait_ready(page)

            elapsed = 0.0
            elapsed = render_segment(page, writer, elapsed, 2.0, duration)
            elapsed = render_segment(
                page,
                writer,
                elapsed,
                1.2,
                duration,
                drag=((520, 880), (690, 820)),
            )
            elapsed = render_segment(page, writer, elapsed, 3.0, duration, height_range=(25, 82))

            click_place(page, "tibet")
            elapsed = render_segment(page, writer, elapsed, 3.4, duration)

            click_place(page, "sichuan")
            elapsed = render_segment(page, writer, elapsed, 3.2, duration)

            click_place(page, "tianshan")
            elapsed = render_segment(page, writer, elapsed, 3.2, duration)

            page.locator("#reset").evaluate("(element) => element.click()")
            render_segment(
                page,
                writer,
                elapsed,
                3.0,
                duration,
                drag=((540, 900), (390, 850)),
            )
            browser.close()
    finally:
        writer.release()
        server.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            server.wait(timeout=3)
        if server.poll() is None:
            server.kill()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    started = time.monotonic()
    create_video(args.output.resolve())
    elapsed = time.monotonic() - started
    print(f"Created {args.output.resolve()} in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
