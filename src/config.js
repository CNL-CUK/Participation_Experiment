export const CONFIG = {
  // 실험이 바뀌면 아래 운영 정보를 수정하세요.
  labNameDesktop: 'Cognitive Neuroscience Lab',
  labNameMobile: 'Cognitive Neuroscience Lab',
  labSiteUrl: 'https://sites.google.com/view/skjeong/home',
  title: '실험 참가 예약',
  place: '비르투스관 304호',
  duration: '약 50분',
  contact: '010-2863-5151',
  reward: '',

  // Apps Script의 POLICY 값과 동일하게 유지하세요.
  cancelDeadlineHours: 3,
  studentIdLength: 9,

  arriveBeforeMinutes: 10,
  showCourseFields: true,
  courseNote:
  '실험 참여 가산점을 신청하는 경우, 강의명과 담당 교수를 모두 입력해 주세요. 해당되지 않는 경우에는 비워 두셔도 됩니다.',
  mobileBreakpoint: 768,
};

export function noticeText() {
  return `예약 시간 ${CONFIG.arriveBeforeMinutes}분 전까지 도착해 주세요. 온라인 취소는 실험 ${CONFIG.cancelDeadlineHours}시간 전까지 가능합니다.`;
}

export function cancelNoteText() {
  return `온라인 취소는 실험 ${CONFIG.cancelDeadlineHours}시간 전까지 가능합니다.\n이후에는 ${CONFIG.contact}로 연락해 주세요.`;
}
