/**
 * Instagram Graph API 投稿サービス
 * 要件定義 FR-10 Instagram 自動投稿
 * 要件定義 EX-06 トークン期限切れ時の再認証URL通知
 */
import axios from 'axios';
import { env, isMocked } from '../config/env';
import { logger } from '../utils/logger';

export type IgPostType = 'feed' | 'reel' | 'story';

export interface IgPostInput {
  postType: IgPostType;
  mediaUrls: string[]; // 外部から取得可能な公開URL (署名付きURL)
  caption: string;
}
export interface IgPostResult {
  success: boolean;
  postUrl?: string;
  reason?: string;
  tokenExpired?: boolean;
}

export async function publishInstagram(input: IgPostInput): Promise<IgPostResult> {
  if (isMocked.ig()) {
    const id = 'MOCK' + Math.random().toString(36).slice(2, 10).toUpperCase();
    logger.info('instagram publish (mock)', {
      postType: input.postType,
      count: input.mediaUrls.length,
    });
    return { success: true, postUrl: `https://www.instagram.com/p/${id}/` };
  }

  try {
    const base = `https://graph.facebook.com/v21.0/${env.ig.businessAccountId}`;
    // 単画像 feed 投稿 (MVP): 複数枚や Reel/Story は拡張余地を残して API endpoint のみ分岐
    const mediaUrl = input.mediaUrls[0];
    let containerEndpoint = `${base}/media`;
    const params: Record<string, string> = {
      image_url: mediaUrl,
      caption: input.caption,
      access_token: env.ig.accessToken,
    };
    if (input.postType === 'reel') {
      params.media_type = 'REELS';
      params.video_url = mediaUrl;
      delete params.image_url;
    } else if (input.postType === 'story') {
      params.media_type = 'STORIES';
    }

    const { data: container } = await axios.post(containerEndpoint, null, { params });
    const creationId = container.id;

    const { data: published } = await axios.post(
      `${base}/media_publish`,
      null,
      { params: { creation_id: creationId, access_token: env.ig.accessToken } },
    );
    const postId = published.id;
    return { success: true, postUrl: `https://www.instagram.com/p/${postId}/` };
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message ?? e?.message ?? 'unknown error';
    const code = e?.response?.data?.error?.code;
    const tokenExpired = code === 190 || /token/i.test(msg);
    logger.error('instagram publish failed', { msg, code, tokenExpired });
    return { success: false, reason: msg, tokenExpired };
  }
}
