export function setupImage(app) {
  // 既存の標準アップロード処理
  app.post('/api/optimize', async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body['file'];
      if (!file) return c.json({ error: '画像ファイルが見つかりません' }, 400);

      // ★ ご自身のCloudinary情報を入れてください
      const CLOUD_NAME = 'dzjo6duru'; 
      const UPLOAD_PRESET = 'ml_default'; 

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Cloudinaryへのアップロードに失敗しました');
      }

      const data = await res.json();
      const optimizedUrl = data.secure_url.replace('/upload/', '/upload/e_improve/');
      const downloadUrl = data.secure_url.replace('/upload/', '/upload/e_improve,fl_attachment/');

      return c.json({ success: true, optimizedUrl: optimizedUrl, downloadUrl: downloadUrl });
    } catch (error) {
      return c.json({ error: error.message }, 500);
    }
  });

  // Geminiスキル（Function Calling）を利用したスマート画像補正
  app.post('/api/optimize-smart', async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body['file'];
      const prompt = body['prompt'] || '画像を自動で綺麗に補正して';
      
      // Gemini API Keyを環境変数から取得 (wrangler.toml等の設定が必要)
      const GEMINI_API_KEY = c.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
         return c.json({ error: 'GEMINI_API_KEYが設定されていません' }, 500);
      }

      if (!file) return c.json({ error: '画像ファイルが見つかりません' }, 400);

      // 1. GeminiにFunction Callingを使ってプロンプトからCloudinaryの変換パラメータを推論させる（スキル/ハーネスとしての役割）
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      
      const geminiRequest = {
        contents: [{ 
          role: "user", 
          parts: [{ text: `以下のユーザーの要望に基づいて、画像編集用のパラメータを生成してください。\n要望: ${prompt}` }] 
        }],
        tools: [{
          function_declarations: [{
            name: "apply_image_transformation",
            description: "ユーザーの要望に基づいて、Cloudinaryで利用可能な画像変換パラメータのリストを生成します。",
            parameters: {
              type: "OBJECT",
              properties: {
                transformations: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                  description: "Cloudinaryの変換文字列の配列 (例: ['e_improve', 'e_sepia', 'e_brightness:30', 'e_contrast:20', 'c_fill,h_300,w_300'])"
                }
              },
              required: ["transformations"]
            }
          }]
        }],
        tool_config: {
          function_calling_config: { mode: "ANY", allowed_function_names: ["apply_image_transformation"] }
        }
      };

      const geminiRes = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequest)
      });

      if (!geminiRes.ok) {
         throw new Error('Gemini APIの呼び出しに失敗しました');
      }
      const geminiData = await geminiRes.json();
      
      let transformStr = 'e_improve'; // デフォルトの補正
      
      // Function callの結果をパースして変換文字列を構築
      const functionCall = geminiData.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      if (functionCall && functionCall.name === 'apply_image_transformation') {
         const args = functionCall.args;
         if (args.transformations && args.transformations.length > 0) {
            transformStr = args.transformations.join(',');
         }
      }

      // 2. 画像をCloudinaryにアップロード
      const CLOUD_NAME = 'dzjo6duru'; 
      const UPLOAD_PRESET = 'ml_default'; 

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);

      const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (!cloudRes.ok) {
        const err = await cloudRes.json();
        throw new Error(err.error?.message || 'Cloudinaryへのアップロードに失敗しました');
      }

      const cloudData = await cloudRes.json();
      
      // 3. Geminiの推論によって得られた変換パラメータを画像URLに適用
      const optimizedUrl = cloudData.secure_url.replace('/upload/', `/upload/${transformStr}/`);
      const downloadUrl = cloudData.secure_url.replace('/upload/', `/upload/${transformStr},fl_attachment/`);

      return c.json({ 
        success: true, 
        optimizedUrl: optimizedUrl, 
        downloadUrl: downloadUrl,
        appliedTransformations: transformStr
      });
    } catch (error) {
      return c.json({ error: error.message }, 500);
    }
  });
}