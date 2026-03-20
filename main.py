from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from newspaper import Article
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lex_rank import LexRankSummarizer
import re

app = FastAPI(title="My Dashboard AI News API (Lightweight)")

# 🔒 セキュリティ設定
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

# 📝 要約エンジン
def summarize_text(text, sentences_count=3):
    parser = PlaintextParser.from_string(text, Tokenizer("japanese"))
    summarizer = LexRankSummarizer()
    summary = summarizer(parser.document, sentences_count)
    return [str(sentence) for sentence in summary]

# 🧠 軽量な感情分析エンジン（キーワード辞書方式）
def analyze_sentiment_light(text):
    # 経済・ITニュースによく出るキーワード
    positive_words = ['上昇', '好調', '最高', '増益', '改善', '期待', '回復', '反発', '黒字', '成長', 'メリット', '成功', '革新', '買収']
    negative_words = ['下落', '不調', '最悪', '減益', '悪化', '懸念', '後退', '反落', '赤字', '衰退', 'デメリット', '失敗', '警戒', 'ショック', '流出']
    
    pos_count = sum(1 for word in positive_words if word in text)
    neg_count = sum(1 for word in negative_words if word in text)
    
    if pos_count > neg_count:
        return "POSITIVE"
    elif neg_count > pos_count:
        return "NEGATIVE"
    else:
        return "NEUTRAL"

@app.get("/")
def read_root():
    return {"status": "AI News API is running (Lightweight)"}

@app.post("/analyze")
async def analyze_news(request: NewsRequest):
    if not request.url:
        raise HTTPException(status_code=400, detail="URL is required")

    try:
        # 1. ディープ・スクレイピング (newspaper3k)
        article = Article(request.url, language='ja')
        article.download()
        article.parse()
        
        title = article.title
        body = article.text
        top_image = article.top_image

        if not body or len(body) < 100:
             return {
                "title": title,
                "summary": ["記事本文が短すぎるか、自動取得がブロックされているサイトです。"],
                "sentiment": "NEUTRAL",
                "top_image": top_image,
                "url": request.url
            }

        cleaned_body = re.sub(r'[\r\n\t]+', ' ', body).strip()

        # 2. 軽量感情分析
        sentiment = analyze_sentiment_light(cleaned_body)

        # 3. 自然言語処理による要約 (sumy)
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