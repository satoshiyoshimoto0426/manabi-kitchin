/**
 * Flex Message ビルダー
 * 要件定義 第9章 UI 原則: 「3タップ以内で完了」「誤タップ防止」
 * FR-09 承認フロー: [✅登録する] [✏修正する] [❌取消]
 */
// (types.ts の RosterOcrSummary 相当は下の RosterOcrSummaryLike で定義済)

export interface RosterOcrSummaryLike {
  adultCount: number;
  childCount: number;
  newcomerCount: number;
  totalFee: number;
  eventDate: string;
  approvalId: string;
}

export function classifyingMessage(kind: 'receipt' | 'roster' | 'event_photo' | 'unknown') {
  const label = {
    receipt: '🧾 レシートを受け取りました!解析中です…',
    roster: '📋 名簿を受け取りました!解析中です…',
    event_photo: '📸 写真を受け取りました!加工中です…',
    unknown: '🔍 画像を確認しています…',
  }[kind];
  return { type: 'text', text: label };
}

/** FR-02/03 レシート承認 Flex */
export function buildReceiptApprovalFlex(params: {
  approvalId: string;
  vendor: string;
  total: number;
  date: string;
  category: string;
  items: string[];
  confidence: number;
}) {
  const {
    approvalId,
    vendor,
    total,
    date,
    category,
    items,
    confidence,
  } = params;

  return {
    type: 'flex',
    altText: `レシート登録確認: ${vendor} ¥${total.toLocaleString()}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📝 解析結果', weight: 'bold', size: 'lg' },
          {
            type: 'text',
            text: `AI信頼度: ${(confidence * 100).toFixed(0)}%`,
            size: 'xs',
            color: '#888888',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          kv('日付', date || '—'),
          kv('店舗', vendor || '—'),
          kv('合計', `¥${total.toLocaleString()}`),
          kv('勘定科目', category),
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'text',
            text: '品目:',
            size: 'sm',
            color: '#666666',
            margin: 'sm',
          },
          {
            type: 'text',
            text: (items.slice(0, 5).join(' / ') || '—') + (items.length > 5 ? ' …' : ''),
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: 'この内容で帳簿に登録しますか?',
            margin: 'md',
            weight: 'bold',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          btn('primary', '✅ 登録', `action=approve&id=${approvalId}`),
          btn('secondary', '✏ 修正', `action=edit&id=${approvalId}`),
          btn('secondary', '❌ 取消', `action=cancel&id=${approvalId}`),
        ],
      },
    },
  };
}

/** FR-04 名簿承認 Flex */
export function buildRosterApprovalFlex(p: RosterOcrSummaryLike) {
  return {
    type: 'flex',
    altText: `名簿登録確認: 大人${p.adultCount}名 / こども${p.childCount}名`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: '📋 名簿 解析結果', weight: 'bold', size: 'lg' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          kv('開催日', p.eventDate),
          kv('大人', `${p.adultCount}名`),
          kv('こども', `${p.childCount}名`),
          kv('新規参加者', `${p.newcomerCount}名`),
          kv('利用料合計', `¥${p.totalFee.toLocaleString()}`),
          {
            type: 'text',
            text: 'この内容で登録しますか?',
            margin: 'md',
            weight: 'bold',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          btn('primary', '✅ 登録', `action=approve&id=${p.approvalId}`),
          btn('secondary', '✏ 修正', `action=edit&id=${p.approvalId}`),
          btn('secondary', '❌ 取消', `action=cancel&id=${p.approvalId}`),
        ],
      },
    },
  };
}

/** FR-08/10 SNS投稿承認 Flex */
export function buildPostApprovalFlex(p: {
  approvalId: string;
  caption: string;
  hashtags: string[];
  mediaPreviewUrl?: string;
  postType: 'feed' | 'reel' | 'story';
  faceCount: number;
  faceCheckSuspicious: boolean;
}) {
  const contents: any[] = [];
  if (p.mediaPreviewUrl) {
    contents.push({
      type: 'image',
      url: p.mediaPreviewUrl,
      aspectRatio: '1:1',
      aspectMode: 'cover',
      size: 'full',
    });
  }
  const bodyContents: any[] = [
    kv('投稿種別', p.postType.toUpperCase()),
    kv('検出顔数', `${p.faceCount}件 (ぼかし済)`),
  ];
  if (p.faceCheckSuspicious) {
    bodyContents.push({
      type: 'text',
      text: '⚠ 未ぼかしの人物が検出された可能性があります。プレビューをご確認ください。',
      color: '#cc0000',
      size: 'sm',
      wrap: true,
      margin: 'sm',
    });
  }
  bodyContents.push(
    { type: 'separator', margin: 'md' },
    {
      type: 'text',
      text: 'キャプション',
      color: '#888888',
      size: 'xs',
      margin: 'md',
    },
    { type: 'text', text: p.caption, wrap: true, size: 'sm' },
    {
      type: 'text',
      text: p.hashtags.join(' '),
      color: '#3366cc',
      size: 'xs',
      wrap: true,
      margin: 'sm',
    },
  );

  return {
    type: 'flex',
    altText: 'Instagram投稿確認',
    contents: {
      type: 'bubble',
      hero: p.mediaPreviewUrl
        ? {
            type: 'image',
            url: p.mediaPreviewUrl,
            aspectRatio: '1:1',
            aspectMode: 'cover',
            size: 'full',
          }
        : undefined,
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          btn('primary', '✅ 投稿', `action=approve&id=${p.approvalId}`),
          btn('secondary', '✏ 修正', `action=edit&id=${p.approvalId}`),
          btn('secondary', '❌ 取消', `action=cancel&id=${p.approvalId}`),
        ],
      },
    },
  };
}

/** EX-02 種別判別不可 → メニュー提示 */
export function buildClassificationMenu(mediaId: string) {
  return {
    type: 'flex',
    altText: '何の画像か判別できませんでした',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '❓ 何の画像か判別できませんでした',
            weight: 'bold',
            wrap: true,
          },
          {
            type: 'text',
            text: '種別を教えてください:',
            size: 'sm',
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          btn('primary', '🧾 レシート', `action=reclass&id=${mediaId}&as=receipt`),
          btn('primary', '📋 名簿', `action=reclass&id=${mediaId}&as=roster`),
          btn('primary', '📸 写真', `action=reclass&id=${mediaId}&as=event_photo`),
        ],
      },
    },
  };
}

/** メインメニュー */
export function buildMainMenu() {
  return {
    type: 'flex',
    altText: 'メニュー',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'まなびキッチン メニュー', weight: 'bold', size: 'lg' },
          { type: 'text', text: '画像を送るだけで自動処理されます', size: 'xs', color: '#888888' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          btn('primary', '📊 月次サマリを見る', 'action=summary'),
          btn('secondary', '✏ レシート手入力', 'action=manual_receipt'),
          btn('secondary', '📮 保留中を表示', 'action=pending'),
          btn('secondary', '❓ ヘルプ', 'action=help'),
        ],
      },
    },
  };
}

/** 手入力用テキストプロンプト (EX-01 OCR信頼度低時のフォーム案内) */
export function buildManualReceiptPrompt() {
  return {
    type: 'text',
    text:
      '✏ 手入力で登録します。以下の形式でメッセージを送信してください:\n\n' +
      '日付,店舗,金額,科目\n例: 2026-04-16,○○スーパー,4820,食材費\n\n' +
      '(科目: 食材費/消耗品費/交通費/雑費/会場費/謝礼費)',
  };
}

// ---------- private ----------
function kv(k: string, v: string) {
  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      { type: 'text', text: k, color: '#888888', size: 'sm', flex: 3 },
      { type: 'text', text: v, size: 'sm', flex: 7, wrap: true },
    ],
  };
}

function btn(style: 'primary' | 'secondary', label: string, data: string) {
  return {
    type: 'button',
    style,
    height: 'sm',
    action: { type: 'postback', label, data, displayText: label },
  };
}

// =============================================================
// リッチメニュー ガイド (FR-09 / docs/features/10_公式LINEとリッチメニュー.md)
// =============================================================

export function buildReceiptGuide() {
  return {
    type: 'flex',
    altText: '🧾 領収書を送る方法',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: '#2E7D32', paddingAll: 'md',
        contents: [{ type: 'text', text: '🧾 領収書を送る', color: '#FFFFFF', weight: 'bold', size: 'lg' }],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'text', text: '📷 簡単3ステップ', weight: 'bold', size: 'md', color: '#1B5E20' },
          { type: 'text', text: '1. 「📎」をタップしカメラ起動', size: 'sm', wrap: true },
          { type: 'text', text: '2. 領収書全体が枠内に収まるよう撮影', size: 'sm', wrap: true },
          { type: 'text', text: '3. 送信ボタンを押す → 自動で記帳！', size: 'sm', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '💡 ヒント', weight: 'bold', size: 'sm', color: '#F57C00', margin: 'md' },
          { type: 'text', text: '• 複数枚OK（連続送信可）', size: 'xs', color: '#666666' },
          { type: 'text', text: '• 暗いと読み取り精度↓', size: 'xs', color: '#666666' },
          { type: 'text', text: '• 折れ目はできるだけ伸ばして', size: 'xs', color: '#666666' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#2E7D32', height: 'sm',
            action: { type: 'uri', label: '📷 カメラを起動', uri: 'line://nv/camera/' } },
          { type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: '✏ 手入力する', data: 'action=manual_receipt', displayText: '✏ 手入力する' } },
        ],
      },
    },
  };
}

export function buildRosterGuide() {
  return {
    type: 'flex',
    altText: '📋 名簿を撮る方法',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: '#F57C00', paddingAll: 'md',
        contents: [{ type: 'text', text: '📋 名簿を撮影', color: '#FFFFFF', weight: 'bold', size: 'lg' }],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'text', text: '📷 撮影のコツ', weight: 'bold', size: 'md', color: '#1B5E20' },
          { type: 'text', text: '1. 真上から撮る（斜めはNG）', size: 'sm', wrap: true },
          { type: 'text', text: '2. 氏名欄が読める明るさで', size: 'sm', wrap: true },
          { type: 'text', text: '3. 紙全体が画面に収まるように', size: 'sm', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '🔒 安心', weight: 'bold', size: 'sm', color: '#F57C00', margin: 'md' },
          { type: 'text', text: '氏名はAES-256で暗号化され、', size: 'xs', color: '#666666', wrap: true },
          { type: 'text', text: '原本画像も処理後に削除されます。', size: 'xs', color: '#666666', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'button', style: 'primary', color: '#F57C00', height: 'sm',
            action: { type: 'uri', label: '📷 カメラを起動', uri: 'line://nv/camera/' } },
        ],
      },
    },
  };
}

export function buildPhotoGuide() {
  return {
    type: 'flex',
    altText: '📷 活動写真を送る方法',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: '#1565C0', paddingAll: 'md',
        contents: [{ type: 'text', text: '📷 活動写真・動画を送る', color: '#FFFFFF', weight: 'bold', size: 'lg' }],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'text', text: '📸 こんな写真がおすすめ', weight: 'bold', size: 'md', color: '#1B5E20' },
          { type: 'text', text: '• 食事の様子・調理風景', size: 'sm', wrap: true },
          { type: 'text', text: '• 完成した料理（顔なし）', size: 'sm', wrap: true },
          { type: 'text', text: '• 全景・後ろ姿は積極的に', size: 'sm', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '🙈 顔ぼかしの仕組み', weight: 'bold', size: 'sm', color: '#F57C00', margin: 'md' },
          { type: 'text', text: 'AIが全員の顔を自動でぼかします。', size: 'xs', color: '#666666', wrap: true },
          { type: 'text', text: '1人でも顔が残ると投稿ブロック。', size: 'xs', color: '#666666', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '💡 動画は最大15秒推奨', size: 'xs', color: '#888888', margin: 'sm' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'button', style: 'primary', color: '#1565C0', height: 'sm',
            action: { type: 'uri', label: '📷 カメラを起動', uri: 'line://nv/camera/' } },
        ],
      },
    },
  };
}

/** Owner専用: メンバー管理 */
export function buildMembersAdmin() {
  return {
    type: 'flex',
    altText: '👥 メンバー管理',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: '👥 メンバー管理', weight: 'bold', size: 'xl', color: '#F57C00' },
          { type: 'text', text: '管理画面で以下が行えます：', size: 'sm', color: '#666666' },
          { type: 'text', text: '• 新規スタッフ招待', size: 'sm' },
          { type: 'text', text: '• 役割変更 (Staff↔Owner)', size: 'sm' },
          { type: 'text', text: '• アクセス停止/再開', size: 'sm' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'button', style: 'primary', color: '#F57C00', height: 'sm',
            action: { type: 'uri', label: '管理画面を開く', uri: 'https://example.com/admin/members' } },
        ],
      },
    },
  };
}

/** 活動終了報告 */
export function buildEventCloseConfirm() {
  return {
    type: 'flex',
    altText: '✨ 活動終了報告',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: '✨ 本日の活動を終了しますか？', weight: 'bold', size: 'lg' },
          { type: 'text', text: '終了後、自動で以下が実行されます：', size: 'sm', color: '#666666', wrap: true },
          { type: 'text', text: '✓ 当日の集計レポート生成', size: 'sm' },
          { type: 'text', text: '✓ メニューを通常版に戻す', size: 'sm' },
          { type: 'text', text: '✓ Owner にサマリー送信', size: 'sm' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#2E7D32', height: 'sm',
            action: { type: 'postback', label: '✅ 終了する', data: 'action=event_close_confirm', displayText: '✅ 終了する' } },
          { type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: '❌ キャンセル', data: 'action=event_close_cancel', displayText: '❌ キャンセル' } },
        ],
      },
    },
  };
}
