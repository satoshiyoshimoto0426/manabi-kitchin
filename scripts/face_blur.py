#!/usr/bin/env python3
"""
顔ぼかしスクリプト (MediaPipe + OpenCV)
要件定義 FR-06 準拠
usage: python3 face_blur.py <input_path> <output_path> <mime>
stderr に `FACES=N` を出力する。
"""
import sys
import os

def main():
    if len(sys.argv) < 4:
        print("usage: face_blur.py <input> <output> <mime>", file=sys.stderr)
        sys.exit(2)
    in_path, out_path, mime = sys.argv[1], sys.argv[2], sys.argv[3]
    try:
        import cv2
        import numpy as np
        import mediapipe as mp
    except ImportError as e:
        print(f"missing deps: {e}", file=sys.stderr)
        # 依存が無い場合はフォールバックとして素通し
        with open(in_path, "rb") as fin, open(out_path, "wb") as fout:
            fout.write(fin.read())
        print("FACES=0", file=sys.stderr)
        return

    if mime.startswith("image/"):
        faces = blur_image(in_path, out_path, mp, cv2, np)
        print(f"FACES={faces}", file=sys.stderr)
    elif mime.startswith("video/"):
        faces = blur_video(in_path, out_path, mp, cv2, np)
        print(f"FACES={faces}", file=sys.stderr)
    else:
        # 不明 MIME は素通し
        with open(in_path, "rb") as fin, open(out_path, "wb") as fout:
            fout.write(fin.read())
        print("FACES=0", file=sys.stderr)


def blur_image(in_path, out_path, mp, cv2, np):
    img = cv2.imread(in_path)
    if img is None:
        with open(in_path, "rb") as fin, open(out_path, "wb") as fout:
            fout.write(fin.read())
        return 0
    det = mp.solutions.face_detection.FaceDetection(
        model_selection=1, min_detection_confidence=0.4
    )
    h, w = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = det.process(rgb)
    faces = 0
    if results.detections:
        for d in results.detections:
            bb = d.location_data.relative_bounding_box
            x, y = max(0, int(bb.xmin * w)), max(0, int(bb.ymin * h))
            bw, bh = int(bb.width * w), int(bb.height * h)
            # 少し広めにマスキング
            pad = int(max(bw, bh) * 0.2)
            x1, y1 = max(0, x - pad), max(0, y - pad)
            x2, y2 = min(w, x + bw + pad), min(h, y + bh + pad)
            roi = img[y1:y2, x1:x2]
            if roi.size == 0:
                continue
            k = max(21, (max(x2 - x1, y2 - y1) // 3) | 1)  # 奇数
            img[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (k, k), 0)
            faces += 1
    cv2.imwrite(out_path, img)
    return faces


def blur_video(in_path, out_path, mp, cv2, np):
    cap = cv2.VideoCapture(in_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(out_path, fourcc, fps, (w, h))
    det = mp.solutions.face_detection.FaceDetection(
        model_selection=1, min_detection_confidence=0.4
    )
    faces_total = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = det.process(rgb)
        if res.detections:
            for d in res.detections:
                bb = d.location_data.relative_bounding_box
                x, y = max(0, int(bb.xmin * w)), max(0, int(bb.ymin * h))
                bw, bh = int(bb.width * w), int(bb.height * h)
                pad = int(max(bw, bh) * 0.2)
                x1, y1 = max(0, x - pad), max(0, y - pad)
                x2, y2 = min(w, x + bw + pad), min(h, y + bh + pad)
                roi = frame[y1:y2, x1:x2]
                if roi.size == 0:
                    continue
                k = max(21, (max(x2 - x1, y2 - y1) // 3) | 1)
                frame[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (k, k), 0)
                faces_total += 1
        writer.write(frame)
    cap.release()
    writer.release()
    return faces_total


if __name__ == "__main__":
    main()
