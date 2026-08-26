// Tiny i18n layer (global `i18n`). Language is detected from the browser, can be
// toggled, and persists in localStorage. Server responses carry only status +
// an `error` CODE; all user-facing text (including error messages) is resolved
// here, so switching language re-localizes everything without touching the server.
window.i18n = (() => {
  const DICT = {
    ko: {
      // topbar / sidebar (static)
      'topbar.workpath': '작업 경로', 'topbar.change': '변경',
      'topbar.new': '+ 새 글', 'topbar.save': '드래프트 저장', 'topbar.submit': 'Submit →',
      'tab.files': '파일', 'tab.drafts': '드래프트',
      'ph.fileSearch': '파일 검색…', 'target.unset': '(미지정)',
      // save status
      'status.editing': '편집됨…', 'status.saved': '저장됨 ✓', 'status.saveFailed': '저장 실패',
      'status.newPost': '새 글 (편집 시 자동 임시저장)', 'status.opened': '열림 (편집 시 자동 임시저장)',
      'status.opening': '여는 중…', 'status.draftLoaded': '임시저장 불러옴',
      // toasts
      'toast.saved': '임시저장 완료', 'toast.savedTo': '저장 완료: {path}',
      'toast.workpathSet': '작업 경로 설정 완료',
      // confirms / prompts
      'confirm.deleteDraft': '이 임시 저장 항목을 삭제할까요?',
      'confirm.missingImages': '일부 이미지 원본이 없습니다. 계속할까요?',
      'prompt.enterTarget': 'Jekyll 사이트 루트 폴더의 절대 경로를 입력하세요\n(예: E:/516/Github/dnjstlr555.github.io)',
      // drafts / tree
      'draft.none': '현재 열린 항목에 대한 임시저장이 없습니다.', 'draft.untitled': '(제목 없음)',
      'draft.noDate': '날짜 미정', 'draft.hasDraft': '임시저장 있음', 'tree.newDrafts': 'Drafts (새 글)',
      // submit modal
      'submit.fileToWrite': '쓸 파일', 'submit.overwrite': '덮어쓰기', 'submit.newFile': '새 파일',
      'submit.images': '이미지 {n}개 → {dir}/', 'submit.sourceMissing': '원본 없음',
      'submit.extImages': '외부 이미지 {n}개 (제출 시 다운로드)', 'submit.mdPreview': '최종 마크다운 미리보기',
      'btn.cancel': '취소', 'btn.overwriteSubmit': '덮어쓰기하고 Submit', 'btn.submit': 'Submit',
      'modal.overwriteTitle': '⚠ 기존 파일 덮어쓰기', 'modal.submitTitle': 'Submit 미리보기 (dry-run)',
      // frontmatter
      'fm.filename': '파일명', 'fm.rawYaml': 'raw YAML', 'fm.structured': '구조화 보기',
      'fm.rawLabel': 'raw frontmatter (YAML)',
      'ph.title': '글 제목', 'ph.slug': '자동 (제목 기반)', 'ph.desc': '한 줄 요약', 'ph.chip': '입력 후 Enter',
      // editor
      'ed.placeholder': '여기에 작성하거나 Notion에서 붙여넣기…', 'ed.caption': '캡션 (선택)',
      'img.left': '왼쪽 플로트 (.left)', 'img.right': '오른쪽 플로트 (.right)',
      'img.w75': '너비 75% (.w-75)', 'img.w50': '너비 50% (.w-50)',
      'img.shadow': '그림자 (.shadow)', 'img.rounded': '둥근 모서리 (.rounded-10)',
      // blocks
      'block.promptText': '프롬프트 내용…', 'block.term': '용어', 'block.def': '정의',
      'block.addItem': '+ 항목 추가', 'block.rawWarn': '⚠ Raw markdown (그대로 출력됨)',
      'block.inlineMath': '인라인 LaTeX 입력:',
      // errors (by server `error` code)
      'err.no-target': '작업 경로가 지정되지 않았습니다.',
      'err.invalid-target': '올바르지 않은 작업 경로입니다. (_config.yml 이 있는 Jekyll 루트인지 확인하세요)',
      'err.read-failed': '파일을 읽지 못했습니다.', 'err.import-failed': '파일을 여는 데 실패했습니다.',
      'err.not-found': '항목을 찾을 수 없습니다.', 'err.bad-id': '잘못된 ID입니다.',
      'err.draft-not-found': '임시저장을 찾을 수 없습니다.', 'err.no-file': '파일이 없습니다.',
      'err.save-failed': '이미지 저장에 실패했습니다.', 'err.bad-url': '가져올 수 없는 이미지 주소입니다.',
      'err.fetch-failed': '이미지를 다운로드하지 못했습니다.', 'err.plan-failed': '플랜 생성에 실패했습니다.',
      'err.exists': '대상 파일이 이미 존재합니다. 덮어쓰기 확인이 필요합니다.',
      'err.image-copy-failed': '이미지 복사에 실패했습니다.', 'err.commit-failed': '저장에 실패했습니다.',
      'err.external-image-failed': '외부 이미지 다운로드에 실패했습니다.', 'err.upload-failed': '업로드에 실패했습니다.',
      'err.notionAttachment': 'Notion 내부 이미지(attachment:)는 클립보드에 데이터가 없어 가져올 수 없습니다. 이미지를 하나씩 복사해 붙여넣거나 파일로 업로드하세요.',
      'err.badImageUrl': '가져올 수 없는 이미지 주소입니다. 파일로 업로드하거나 이미지를 직접 복사해 붙여넣으세요.',
      'err.noDraft': '임시저장이 준비되지 않았습니다.',
      'err.generic': '오류가 발생했습니다 (코드 {status}).',
    },
    en: {
      'topbar.workpath': 'Work path', 'topbar.change': 'Change',
      'topbar.new': '+ New post', 'topbar.save': 'Save draft', 'topbar.submit': 'Submit →',
      'tab.files': 'Files', 'tab.drafts': 'Drafts',
      'ph.fileSearch': 'Search files…', 'target.unset': '(not set)',
      'status.editing': 'Editing…', 'status.saved': 'Saved ✓', 'status.saveFailed': 'Save failed',
      'status.newPost': 'New post (auto-saves on edit)', 'status.opened': 'Opened (auto-saves on edit)',
      'status.opening': 'Opening…', 'status.draftLoaded': 'Draft loaded',
      'toast.saved': 'Draft saved', 'toast.savedTo': 'Saved: {path}',
      'toast.workpathSet': 'Work path set',
      'confirm.deleteDraft': 'Delete this draft?',
      'confirm.missingImages': 'Some image sources are missing. Continue?',
      'prompt.enterTarget': 'Enter the absolute path to your Jekyll site root\n(e.g. E:/516/Github/dnjstlr555.github.io)',
      'draft.none': 'No draft for the currently open item.', 'draft.untitled': '(untitled)',
      'draft.noDate': 'No date', 'draft.hasDraft': 'Has a draft', 'tree.newDrafts': 'Drafts (new)',
      'submit.fileToWrite': 'File to write', 'submit.overwrite': 'Overwrite', 'submit.newFile': 'New file',
      'submit.images': '{n} image(s) → {dir}/', 'submit.sourceMissing': 'source missing',
      'submit.extImages': '{n} external image(s) (downloaded on submit)', 'submit.mdPreview': 'Final markdown preview',
      'btn.cancel': 'Cancel', 'btn.overwriteSubmit': 'Overwrite & Submit', 'btn.submit': 'Submit',
      'modal.overwriteTitle': '⚠ Overwrite existing file', 'modal.submitTitle': 'Submit preview (dry-run)',
      'fm.filename': 'Filename', 'fm.rawYaml': 'raw YAML', 'fm.structured': 'Structured',
      'fm.rawLabel': 'raw frontmatter (YAML)',
      'ph.title': 'Post title', 'ph.slug': 'auto (from title)', 'ph.desc': 'One-line summary', 'ph.chip': 'Type and press Enter',
      'ed.placeholder': 'Write here, or paste from Notion…', 'ed.caption': 'Caption (optional)',
      'img.left': 'Float left (.left)', 'img.right': 'Float right (.right)',
      'img.w75': 'Width 75% (.w-75)', 'img.w50': 'Width 50% (.w-50)',
      'img.shadow': 'Shadow (.shadow)', 'img.rounded': 'Rounded corners (.rounded-10)',
      'block.promptText': 'Prompt text…', 'block.term': 'Term', 'block.def': 'Definition',
      'block.addItem': '+ Add item', 'block.rawWarn': '⚠ Raw markdown (emitted as-is)',
      'block.inlineMath': 'Enter inline LaTeX:',
      'err.no-target': 'No work path is set.',
      'err.invalid-target': 'Invalid work path. (Make sure it is a Jekyll root with _config.yml)',
      'err.read-failed': 'Could not read the file.', 'err.import-failed': 'Failed to open the file.',
      'err.not-found': 'Item not found.', 'err.bad-id': 'Invalid ID.',
      'err.draft-not-found': 'Draft not found.', 'err.no-file': 'No file provided.',
      'err.save-failed': 'Failed to save the image.', 'err.bad-url': 'Unusable image URL.',
      'err.fetch-failed': 'Failed to download the image.', 'err.plan-failed': 'Failed to build the plan.',
      'err.exists': 'The target file already exists. Overwrite confirmation is required.',
      'err.image-copy-failed': 'Failed to copy an image.', 'err.commit-failed': 'Failed to save.',
      'err.external-image-failed': 'Failed to download an external image.', 'err.upload-failed': 'Upload failed.',
      'err.notionAttachment': 'Notion internal images (attachment:) carry no data in the clipboard. Copy each image individually and paste it, or upload a file.',
      'err.badImageUrl': 'Unusable image URL. Upload a file, or copy and paste the image directly.',
      'err.noDraft': 'Draft is not ready yet.',
      'err.generic': 'Something went wrong (code {status}).',
    },
  };

  function detect() {
    const saved = localStorage.getItem('jn_lang');
    if (saved === 'ko' || saved === 'en') return saved;
    return (navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }
  let LANG = detect();

  function t(key, params) {
    let s = (DICT[LANG] && DICT[LANG][key]);
    if (s == null) s = (DICT.en[key] != null ? DICT.en[key] : key);
    if (params) for (const k in params) s = s.split('{' + k + '}').join(params[k]);
    return s;
  }
  // Localized message for a server error (code from `err.data.error`, else status).
  function errText(code, status) {
    if (code && (DICT[LANG][`err.${code}`] || DICT.en[`err.${code}`])) return t(`err.${code}`);
    return t('err.generic', { status: status != null ? status : '' });
  }
  function getLang() { return LANG; }
  function setLang(l) { LANG = (l === 'ko' ? 'ko' : 'en'); localStorage.setItem('jn_lang', LANG); }

  // Apply to static markup: [data-i18n]=textContent, [data-i18n-ph]=placeholder.
  function applyStatic(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    document.documentElement.lang = LANG;
  }

  return { t, errText, getLang, setLang, applyStatic, locale: () => (LANG === 'ko' ? 'ko-KR' : 'en-US') };
})();
