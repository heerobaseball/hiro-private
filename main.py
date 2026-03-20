from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, ImageEnhance, ImageStat  # ★ImageStatを追加
import io

app = FastAPI(title="Smart Image Optimization API")

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
    return {"status": "Smart Image Optimization API is running"}

@app.post("/optimize")
async def optimize_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # 🧠 1. 画像の「平均的な明るさ」を計算する (0:真っ黒 〜 255:真っ白)
        # モノクロ(L)に変換してから計算するのが一番正確で高速です
        stat = ImageStat.Stat(image.convert("L"))
        avg_brightness = stat.mean[0]

        # 🧠 2. 明るさに応じて「補正の強さ」を自動で変える（スマート補正）
        if avg_brightness < 90:
            # 【パターンA】かなり暗い写真の場合 -> ガッツリ明るくする
            image = ImageEnhance.Brightness(image).enhance(1.5)
            image = ImageEnhance.Contrast(image).enhance(1.2)
            
        elif avg_brightness < 150:
            # 【パターンB】少しだけ暗い写真の場合 -> マイルドに補正
            image = ImageEnhance.Brightness(image).enhance(1.2)
            image = ImageEnhance.Contrast(image).enhance(1.1)
            
        else:
            # 【パターンC】すでに十分明るい写真の場合 -> 何もしない（元のまま）
            pass 

        # 3. 処理した画像を返す
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG', quality=85)
        img_byte_arr = img_byte_arr.getvalue()

        return Response(content=img_byte_arr, media_type="image/jpeg")

    except Exception as e:
        return {"error": str(e)}