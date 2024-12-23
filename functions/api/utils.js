// 从 URL 下载图片并转换为 File 对象
export async function downloadImageFromUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      throw new Error('URL does not point to an image');
    }

    const blob = await response.blob();
    const fileName = url.split('/').pop() || 'image.png';
    return new File([blob], fileName, { type: contentType });
  } catch (error) {
    throw new Error(`Failed to download image: ${error.message}`);
  }
} 