from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, ImageEnhance
import io

app = FastAPI(title="Image Optimization API")

# 🔒 セキュリティ設定（全許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "Image Optimization API is running"}

@app.post("/optimize")
async def optimize_image(file: UploadFile = File(...)):
    try:
        # 1. 送られてきた画像をメモリ上に読み込む
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # JPEGで保存できるように、透過情報(RGBA)があればRGBに変換
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # 2. 画像の最適化（明るさとコントラストの補正）
        # 明るさを1.2倍にアップ（暗い写真を明るく）
        enhancer_brightness = ImageEnhance.Brightness(image)
        image = enhancer_brightness.enhance(1.2)
        
        # コントラストを1.1倍にアップ（文字などをクッキリさせる）
        enhancer_contrast = ImageEnhance.Contrast(image)
        image = enhancer_contrast.enhance(1.1)

        # 3. 処理した画像をメモリ上に保存して返す準備
        img_byte_arr = io.BytesIO()
        # quality=85で、見た目を保ちつつファイルサイズを軽量化
        image.save(img_byte_arr, format='JPEG', quality=85)
        img_byte_arr = img_byte_arr.getvalue()

        # 画像データとして直接レスポンスを返す
        return Response(content=img_byte_arr, media_type="image/jpeg")

    except Exception as e:
        return {"error": str(e)}