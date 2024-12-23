// functions/api/delete.js
import { Octokit } from "@octokit/rest";
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
    const { fileName } = await context.request.json();
    if (!fileName) {
      return new Response(JSON.stringify({
        success: false,
        error: "No file name provided"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    const octokit = new Octokit({
      auth: context.env.GITHUB_TOKEN
    });
    const { data: fileData } = await octokit.repos.getContent({
      owner: context.env.GITHUB_OWNER,
      repo: context.env.GITHUB_REPO,
      path: `images/${fileName}`
    });
    await octokit.repos.deleteFile({
      owner: context.env.GITHUB_OWNER,
      repo: context.env.GITHUB_REPO,
      path: `images/${fileName}`,
      message: "Delete image via API",
      sha: fileData.sha,
      branch: "main"
    });
    return new Response(JSON.stringify({
      success: true,
      message: "File deleted successfully"
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error("Delete error:", error);
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
