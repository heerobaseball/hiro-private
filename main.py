from typing import List
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse
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

# 🧠 画像1枚を補正する関数
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

# 🚀 【追加】トップページに「専用のテスト画面（HTML）」を作る！
@app.get("/")
def read_root():
    html_content = """
    <!DOCTYPE html>
    <html lang="ja">
        <head>
            <meta charset="utf-8">
            <title>画像最適化テストツール</title>
        </head>
        <body style="padding: 30px; font-family: sans-serif; background: #f8fafc;">
            <div style="max-width: 500px; margin: 0 auto; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h2 style="color: #0f172a; margin-top: 0;">📸 画像スマート補正 テスト</h2>
                <p style="color: #64748b; font-size: 14px;">複数の画像を選択して送信すると、ZIPでダウンロードされます。</p>
                
                <form action="/optimize" enctype="multipart/form-data" method="post" style="margin-top: 20px;">
                    <input name="files" type="file" multiple accept="image/*" style="margin-bottom: 20px; display: block; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; width: 100%; box-sizing: border-box;">
                    <button type="submit" style="padding: 12px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; font-size: 16px;">✨ 画像を最適化する</button>
                </form>
            </div>
        </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.post("/optimize")
async def optimize_images(files: List[UploadFile] = File(...)):
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