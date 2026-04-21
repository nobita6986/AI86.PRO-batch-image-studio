import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Route for Image Generation (Proxy to AI86.PRO / Beeknoee)
  app.post("/api/generate", async (req, res) => {
    try {
      const { prompt, model, size, style_ref, character_ref } = req.body;
      const apiKey = process.env.BEEKNOEE_API_KEY;

      if (!apiKey) {
        console.error("API Key missing");
        return res.status(500).json({ error: "API Key (BEEKNOEE_API_KEY) is not configured" });
      }

      // Strictly limit to the allowed models or safe default
      const allowedModels = ["imagen-4.0-fast-generate-001", "imagen-3.0-fast-generate-002"];
      const targetModel = allowedModels.includes(model) ? model : "imagen-4.0-fast-generate-001";

      const payload: any = {
        model: targetModel,
        prompt,
        n: 1,
        size: size || "1024x1024",
        seed: Math.floor(Math.random() * 2147483647) // Generate a random integer seed
      };

      // Handle Image References (Style & Character/Subject)
      // Beeknoee supports style_reference and subject_reference for Imagen models
      if (style_ref && style_ref.length < 5000000) { // Safety limit: 5MB
          payload.style_reference = {
            image: style_ref.includes(',') ? style_ref.split(',')[1] : style_ref
          };
      }
      if (character_ref && character_ref.length < 5000000) { // Safety limit: 5MB
          payload.subject_reference = {
            image: character_ref.includes(',') ? character_ref.split(',')[1] : character_ref
          };
      }

      console.log(`[AI86.PRO] Generating image with model: ${targetModel}`);

      const response = await axios.post(
        "https://platform.beeknoee.com/api/v1/image/generations",
        payload,
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000, // 60s timeout for generation
        }
      );

      let finalData = response.data;
      console.log("[AI86.PRO] API Response received successfully");

      // Transform Beeknoee format to OpenAI-like format and Proxy URLs
      if (finalData && finalData.images) {
        finalData.data = finalData.images.map((img: any) => {
          let originalUrl = img.url;
          if (originalUrl && originalUrl.startsWith('/')) {
            originalUrl = `https://platform.beeknoee.com/api${originalUrl}`;
          }
          // The image download likely requires the same Bearer token, so we proxy it
          const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(originalUrl || '')}`;
          return { url: proxyUrl };
        });
      }

      res.json(finalData);
    } catch (error: any) {
      console.error("Error generating image:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to generate image" });
    }
  });

  // Proxy endpoint for image downloads to include Authentication
  app.get("/api/image-proxy", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).send("Missing target URL");
    }

    try {
      const apiKey = process.env.BEEKNOEE_API_KEY;
      const response = await axios.get(url, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        responseType: "arraybuffer",
      });

      const contentType = response.headers["content-type"];
      if (typeof contentType === 'string') {
        res.setHeader("Content-Type", contentType);
      } else {
        res.setHeader("Content-Type", "image/png");
      }
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(response.data);
    } catch (error: any) {
      console.error("Proxy fetch error:", error.message);
      res.status(error.response?.status || 500).send("Failed to fetch image via proxy");
    }
  });

  // Serve static files and handle SPA
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
