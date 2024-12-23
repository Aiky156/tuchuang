import { Octokit } from '@octokit/rest';
import { downloadImageFromUrl } from './utils';

// 将 ArrayBuffer 转换为 base64 的辅助函数
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.slice(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  
  return btoa(binary);
}

// 处理单个文件上传
async function handleSingleFile(file, context, progressCallback) {
  if (!file) {
    throw new Error('No file provided');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File size exceeds 10MB limit');
  }

  // 报告开始处理
  progressCallback?.(0, 'preparing');

  const buffer = await file.arrayBuffer();
  // 报告文件读取完成
  progressCallback?.(20, 'converting');

  const base64Content = arrayBufferToBase64(buffer);
  // 报告转换完成
  progressCallback?.(40, 'uploading');

  // 生成文件名
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0];
  const randomStr = Math.random().toString(36).substring(2, 8);
  const fileType = file.type || 'image/png';
  const fileExtension = fileType.split('/')[1] || 'png';
  const fileName = `${timestamp}_${randomStr}.${fileExtension}`;

  const octokit = new Octokit({
    auth: context.env.GITHUB_TOKEN
  });

  // 上传文件
  progressCallback?.(60, 'uploading to GitHub');
  const githubResponse = await octokit.repos.createOrUpdateFileContents({
    owner: context.env.GITHUB_OWNER,
    repo: context.env.GITHUB_REPO,
    path: `images/${fileName}`,
    message: 'Upload image via API',
    content: base64Content,
    branch: 'main'
  });

  // 报告上传完成
  progressCallback?.(100, 'completed');

  const imageUrl = `https://raw.githubusercontent.com/${context.env.GITHUB_OWNER}/${context.env.GITHUB_REPO}/main/images/${fileName}`;
  
  return {
    originalName: file.name,
    fileName: fileName,
    url: imageUrl,
    size: file.size,
    type: file.type,
    status: 'success'
  };
}

export async function onRequestPost(context) {
  try {
    // 基本错误检查
    if (!context.env.GITHUB_TOKEN || !context.env.GITHUB_OWNER || !context.env.GITHUB_REPO) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required environment variables'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const contentType = context.request.headers.get('content-type') || '';
    let files = [];

    if (contentType.includes('multipart/form-data')) {
      // 处理表单上传
      const formData = await context.request.formData();
      
      // 处理多文件上传
      if (formData.has('images')) {
        files = formData.getAll('images');
      } else if (formData.has('image')) {
        files = [formData.get('image')];
      } else if (formData.has('urls')) {
        // 处理 URL 列表上传
        const urls = formData.get('urls').split('\n').filter(url => url.trim());
        files = await Promise.all(urls.map(url => downloadImageFromUrl(url.trim())));
      } else if (formData.has('url')) {
        // 处理单个 URL 上传
        const url = formData.get('url');
        files = [await downloadImageFromUrl(url)];
      }
    } else if (contentType.includes('application/json')) {
      // 处理 Base64 批量上传
      const jsonData = await context.request.json();
      if (jsonData.urls) {
        // 处理 URL 列表
        files = await Promise.all(jsonData.urls.map(url => downloadImageFromUrl(url)));
      } else if (jsonData.url) {
        // 处理单个 URL
        files = [await downloadImageFromUrl(jsonData.url)];
      } else if (jsonData.images) {
        // 处理 Base64 图片数据
        files = await Promise.all(jsonData.images.map(async (item) => {
          const base64Data = item.content.split(',')[1] || item.content;
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
          
          const blob = new Blob(byteArrays, { type: item.type || 'image/png' });
          return new File([blob], item.name || 'image.png', { type: item.type || 'image/png' });
        }));
      }
    }

    if (files.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No files provided'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 处理所有文件
    const results = await Promise.all(
      files.map(file => handleSingleFile(file, context, (percent, status) => {
        // 发送进度更新
        context.waitUntil(
          new Response(JSON.stringify({
            type: 'progress',
            fileName: file.name,
            percent,
            status
          }), {
            headers: {
              'Content-Type': 'application/json'
            }
          })
        );
      }).catch(error => ({
        originalName: file.name,
        error: error.message,
        status: 'error'
      })))
    );

    return new Response(JSON.stringify({
      success: true,
      files: results
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.response?.data || {}
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
} 