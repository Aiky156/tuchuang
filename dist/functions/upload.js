// functions/api/upload.js
import { Octokit } from "@octokit/rest";

// functions/api/utils.js
async function downloadImageFromUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      throw new Error("URL does not point to an image");
    }
    const blob = await response.blob();
    const fileName = url.split("/").pop() || "image.png";
    return new File([blob], fileName, { type: contentType });
  } catch (error) {
    throw new Error(`Failed to download image: ${error.message}`);
  }
}

// functions/api/upload.js
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 32768;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.slice(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
async function handleSingleFile(file, context, progressCallback) {
  if (!file) {
    throw new Error("No file provided");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File size exceeds 10MB limit");
  }
  progressCallback?.(0, "preparing");
  const buffer = await file.arrayBuffer();
  progressCallback?.(20, "converting");
  const base64Content = arrayBufferToBase64(buffer);
  progressCallback?.(40, "uploading");
  const now = /* @__PURE__ */ new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, "").split(".")[0];
  const randomStr = Math.random().toString(36).substring(2, 8);
  const fileType = file.type || "image/png";
  const fileExtension = fileType.split("/")[1] || "png";
  const fileName = `${timestamp}_${randomStr}.${fileExtension}`;
  const octokit = new Octokit({
    auth: context.env.GITHUB_TOKEN
  });
  progressCallback?.(60, "uploading to GitHub");
  const githubResponse = await octokit.repos.createOrUpdateFileContents({
    owner: context.env.GITHUB_OWNER,
    repo: context.env.GITHUB_REPO,
    path: `images/${fileName}`,
    message: "Upload image via API",
    content: base64Content,
    branch: "main"
  });
  progressCallback?.(100, "completed");
  const imageUrl = `https://raw.githubusercontent.com/${context.env.GITHUB_OWNER}/${context.env.GITHUB_REPO}/main/images/${fileName}`;
  return {
    originalName: file.name,
    fileName,
    url: imageUrl,
    size: file.size,
    type: file.type,
    status: "success"
  };
}
async function onRequestPost(context) {
  try {
    if (!context.env.GITHUB_TOKEN || !context.env.GITHUB_OWNER || !context.env.GITHUB_REPO) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required environment variables"
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    const contentType = context.request.headers.get("content-type") || "";
    let files = [];
    if (contentType.includes("multipart/form-data")) {
      const formData = await context.request.formData();
      if (formData.has("images")) {
        files = formData.getAll("images");
      } else if (formData.has("image")) {
        files = [formData.get("image")];
      } else if (formData.has("urls")) {
        const urls = formData.get("urls").split("\n").filter((url) => url.trim());
        files = await Promise.all(urls.map((url) => downloadImageFromUrl(url.trim())));
      } else if (formData.has("url")) {
        const url = formData.get("url");
        files = [await downloadImageFromUrl(url)];
      }
    } else if (contentType.includes("application/json")) {
      const jsonData = await context.request.json();
      if (jsonData.urls) {
        files = await Promise.all(jsonData.urls.map((url) => downloadImageFromUrl(url)));
      } else if (jsonData.url) {
        files = [await downloadImageFromUrl(jsonData.url)];
      } else if (jsonData.images) {
        files = await Promise.all(jsonData.images.map(async (item) => {
          const base64Data = item.content.split(",")[1] || item.content;
          const byteCharacters = atob(base64Data);
          const byteArrays = [];
          for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
            const slice = byteCharacters.slice(offset, offset + 1024);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
              byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
          }
          const blob = new Blob(byteArrays, { type: item.type || "image/png" });
          return new File([blob], item.name || "image.png", { type: item.type || "image/png" });
        }));
      }
    }
    if (files.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "No files provided"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    const results = await Promise.all(
      files.map((file) => handleSingleFile(file, context, (percent, status) => {
        context.waitUntil(
          new Response(JSON.stringify({
            type: "progress",
            fileName: file.name,
            percent,
            status
          }), {
            headers: {
              "Content-Type": "application/json"
            }
          })
        );
      }).catch((error) => ({
        originalName: file.name,
        error: error.message,
        status: "error"
      })))
    );
    return new Response(JSON.stringify({
      success: true,
      files: results
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.response?.data || {}
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
export {
  onRequestPost
};
