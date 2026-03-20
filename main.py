from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, ImageEnhance, ImageStat
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

# 🚀 安定版：1枚ずつ確実に受け取る設定
@app.post("/optimize")
async def optimize_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # 🧠 画像の明るさを自動判定してスマート補正
        stat = ImageStat.Stat(image.convert("L"))
        avg_brightness = stat.mean[0]

        if avg_brightness < 90:
            image = ImageEnhance.Brightness(image).enhance(1.5)
            image = ImageEnhance.Contrast(image).enhance(1.2)
            
        elif avg_brightness < 150:
            image = ImageEnhance.Brightness(image).enhance(1.2)
            image = ImageEnhance.Contrast(image).enhance(1.1)

        # 処理した画像を返す
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG', quality=85)
        img_byte_arr = img_byte_arr.getvalue()

        return Response(content=img_byte_arr, media_type="image/jpeg")

    except Exception as e:
        return {"error": str(e)}