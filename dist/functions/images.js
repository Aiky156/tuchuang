// functions/api/images.js
import { Octokit } from "@octokit/rest";
async function onRequestGet(context) {
  try {
    if (!context.env.GITHUB_TOKEN || !context.env.GITHUB_OWNER || !context.env.GITHUB_REPO) {
      throw new Error("Missing required environment variables");
    }
    const octokit = new Octokit({
      auth: context.env.GITHUB_TOKEN
    });
    try {
      const response = await octokit.repos.getContent({
        owner: context.env.GITHUB_OWNER,
        repo: context.env.GITHUB_REPO,
        path: "images"
      });
      const images = Array.isArray(response.data) ? response.data.filter((file) => file.name !== ".gitkeep").map((file) => ({
        name: file.name,
        url: `https://raw.githubusercontent.com/${context.env.GITHUB_OWNER}/${context.env.GITHUB_REPO}/main/images/${file.name}`,
        size: file.size
      })) : [];
      return new Response(JSON.stringify({
        success: true,
        images
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (githubError) {
      if (githubError.status === 404) {
        return new Response(JSON.stringify({
          success: true,
          images: []
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      throw githubError;
    }
  } catch (error) {
    console.error("Error details:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack,
      env: {
        hasToken: !!context.env.GITHUB_TOKEN,
        hasOwner: !!context.env.GITHUB_OWNER,
        hasRepo: !!context.env.GITHUB_REPO
      }
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
  onRequestGet
};
