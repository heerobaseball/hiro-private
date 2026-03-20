from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from newspaper import Article
from asari.api import Sonar  # ★ 修正: 正しい呼び出し元
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lex_rank import LexRankSummarizer
import re

app = FastAPI(title="My Dashboard AI News API")

# 🔒 セキュリティ設定: マイページからのアクセスだけを許可する
origins = [
    "http://localhost:8788", 
    "http://127.0.0.1:8788",
    "https://*.pages.dev",   
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class NewsRequest(BaseModel):
    url: str

# ★ 修正: 感情分析の正しい初期化
sonar = Sonar()

def summarize_text(text, sentences_count=3):
    parser = PlaintextParser.from_string(text, Tokenizer("japanese"))
    summarizer = LexRankSummarizer()
    summary = summarizer(parser.document, sentences_count)
    return [str(sentence) for sentence in summary]

@app.get("/")
def read_root():
    return {"status": "AI News API is running"}

@app.post("/analyze")
async def analyze_news(request: NewsRequest):
    if not request.url:
        raise HTTPException(status_code=400, detail="URL is required")

    try:
        # 1. スクレイピング (newspaper3k)
        article = Article(request.url, language='ja')
        article.download()
        article.parse()
        
        title = article.title
        body = article.text
        top_image = article.top_image

        if not body or len(body) < 100:
             return {
                "title": title,
                "summary": ["記事本文が短すぎるか、スクレイピングできませんでした。"],
                "sentiment": "NEUTRAL",
                "top_image": top_image,
                "url": request.url
            }

        cleaned_body = re.sub(r'[\r\n\t]+', ' ', body).strip()

        # 2. 感情分析 (asari) -> 先頭1000文字のみ分析
        sentiment_res = sonar.ping(cleaned_body[:1000])  # ★ 修正: pingメソッドを使用
        sentiment_score = sentiment_res['top_class'] # 'positive' または 'negative'
        
        sentiment = "POSITIVE" if sentiment_score == "positive" else "NEGATIVE"
        
        # ★ 修正: 正しい辞書のキー(confidence)からスコアを取得してニュートラル判定
        confidences = {c['class_name']: c['confidence'] for c in sentiment_res['classes']}
        if confidences.get('positive', 0) < 0.6 and confidences.get('negative', 0) < 0.6:
            sentiment = "NEUTRAL"

        # 3. 要約 (sumy) -> 3行に要約
        summary_sentences = summarize_text(cleaned_body, sentences_count=3)

        return {
            "title": title,
            "summary": summary_sentences,
            "sentiment": sentiment,
            "top_image": top_image,
            "url": request.url
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)