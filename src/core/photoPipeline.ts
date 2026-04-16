/**
 * 写真・動画処理パイプライン (FR-05, FR-06, FR-07, FR-08, FR-10)
 * 受信 → 顔ぼかし → Gemini 2次チェック → キャプション生成 → 承認 → Instagram 投稿
 */
import { logger } from '../utils/logger';
import { store } from '../services/store';
import { blurFaces } from '../services/faceBlur';
import { generateCaption, verifyFaceBlurring } from '../services/gemini';
import { saveMedia } from '../services/storage';
import { randomId } from '../utils/crypto';
import type { MediaDoc, PendingApprovalDoc, PostDoc } from '../types/domain';
import { buildPostApprovalFlex } from '../line/flex';
import { replyMessage, pushMessage } from '../services/lineClient';
import { publishInstagram } from '../services/instagram';

export async function processEventPhoto(params: {
  media: MediaDoc;
  buffer: Buffer;
  mimeType: string;
  replyToken: string;
  lineUserId: string;
}) {
  const { media, buffer, mimeType, replyToken, lineUserId } = params;

  // 1) 顔ぼかし (回避不可)
  const blurred = await blurFaces(buffer, mimeType);

  // 2) 加工済みメディア保存
  const processedId = randomId('pmd_');
  const saved = await saveMedia(processedId, blurred.buffer, mimeType);

  // 3) EX-09: Gemini 2次チェック
  const verify = await verifyFaceBlurring(blurred.buffer, mimeType);

  // 4) キャプション生成 (FR-08)
  const caption = await generateCaption([blurred.buffer], mimeType);

  // 5) 承認待ち登録
  const approvalId = randomId('apr_');
  const approval: PendingApprovalDoc = {
    approvalId,
    kind: 'post',
    lineUserId,
    payload: {
      originalMediaId: media.mediaId,
      processedMediaId: processedId,
      processedUrl: saved.signedUrl,
      caption: caption.caption,
      hashtags: caption.hashtags,
      postType: mimeType.startsWith('video/') ? 'reel' : 'feed',
      faceCount: blurred.detectedFaces,
      faceCheckSuspicious: verify.suspicious,
    },
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  };
  await store.pendingApprovals.upsert(approval);

  const flex = buildPostApprovalFlex({
    approvalId,
    caption: caption.caption,
    hashtags: caption.hashtags,
    mediaPreviewUrl: saved.signedUrl.startsWith('http') ? saved.signedUrl : undefined,
    postType: approval.payload.postType as any,
    faceCount: blurred.detectedFaces,
    faceCheckSuspicious: verify.suspicious,
  });

  const msgs: any[] = [flex];
  if (verify.suspicious) {
    msgs.unshift({
      type: 'text',
      text: '⚠ 未ぼかしの顔が写っている可能性があります。投稿を取消して再撮影を推奨します。',
    });
  }
  await replyMessage(replyToken, msgs);

  await store.media.upsert({
    ...media,
    status: 'pending_approval',
    updatedAt: new Date().toISOString(),
  });

  logger.info('photo pipeline completed', {
    mediaId: media.mediaId,
    faces: blurred.detectedFaces,
    suspicious: verify.suspicious,
  });
}

export async function confirmPostApproval(
  approval: PendingApprovalDoc,
  approvedBy: string,
): Promise<{ ok: boolean; postUrl?: string; reason?: string }> {
  if (approval.kind !== 'post') return { ok: false };
  const p = approval.payload as any;

  const caption = `${p.caption}\n\n${(p.hashtags ?? []).join(' ')}`.trim();
  const post: PostDoc = {
    postId: randomId('po_'),
    channel: 'instagram',
    postType: p.postType,
    mediaIds: [p.processedMediaId],
    caption,
    status: 'approved',
    approvedBy,
    createdAt: new Date().toISOString(),
  };
  await store.posts.upsert(post);

  const result = await publishInstagram({
    postType: p.postType,
    mediaUrls: [p.processedUrl],
    caption,
  });

  if (!result.success) {
    await store.posts.upsert({ ...post, status: 'failed' });
    if (result.tokenExpired) {
      // EX-06 トークン切れ
      await pushMessage(approvedBy, [
        {
          type: 'text',
          text: '⚠ Instagram のアクセストークンが期限切れです。運営代表者に再認証を依頼してください。',
        },
      ]);
    } else {
      await pushMessage(approvedBy, [
        { type: 'text', text: `❌ Instagram投稿に失敗しました: ${result.reason}` },
      ]);
    }
    await store.pendingApprovals.upsert({ ...approval, status: 'approved' });
    return { ok: false, reason: result.reason };
  }

  await store.posts.upsert({
    ...post,
    status: 'published',
    igPostUrl: result.postUrl,
    publishedAt: new Date().toISOString(),
  });
  await store.pendingApprovals.upsert({ ...approval, status: 'approved' });
  return { ok: true, postUrl: result.postUrl };
}
