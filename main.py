from typing import List, Annotated  # ★Annotatedを追加
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, ImageEnhance, ImageStat
import io
import zipfile

app = FastAPI(title="Smart Batch Image Optimization API")

# 🔒 セキュリティ設定（全許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🧠 画像1枚を補正する関数（共通処理）
def process_image(contents: bytes) -> bytes:
    image = Image.open(io.BytesIO(contents))
    
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")

    stat = ImageStat.Stat(image.convert("L"))
    avg_brightness = stat.mean[0]

    if avg_brightness < 90:
        image = ImageEnhance.Brightness(image).enhance(1.5)
        image = ImageEnhance.Contrast(image).enhance(1.2)
    elif avg_brightness < 150:
        image = ImageEnhance.Brightness(image).enhance(1.2)
        image = ImageEnhance.Contrast(image).enhance(1.1)

    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='JPEG', quality=85)
    return img_byte_arr.getvalue()

@app.get("/")
def read_root():
    return {"status": "Smart Batch Image Optimization API is running"}

# 🚀 【修正】最新のFastAPI公式推奨の書き方（Annotatedを使用）
@app.post("/optimize")
async def optimize_images(files: Annotated[List[UploadFile], File(description="複数ファイルを選択")]):
    try:
        # 【パターンA】もし1枚だけアップロードされたら、そのまま画像を返す
        if len(files) == 1:
            contents = await files[0].read()
            processed_bytes = process_image(contents)
            return Response(content=processed_bytes, media_type="image/jpeg")

        # 【パターンB】複数枚アップロードされたら、ZIPファイルにまとめて返す
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for i, file in enumerate(files):
                contents = await file.read()
                processed_bytes = process_image(contents)
                
                # 元のファイル名を取り出し、末尾に _optimized.jpg を付ける
                original_name = file.filename if file.filename else f"image_{i+1}.jpg"
                if '.' in original_name:
                    name_parts = original_name.rsplit('.', 1)
                    safe_filename = f"{name_parts[0]}_optimized.jpg"
                else:
                    safe_filename = f"{original_name}_optimized.jpg"
                
                zip_file.writestr(safe_filename, processed_bytes)

        return Response(
            content=zip_buffer.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=optimized_images.zip"}
        )

    except Exception as e:
        return {"error": str(e)}