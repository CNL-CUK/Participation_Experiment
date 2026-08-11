import { CONFIG } from '../config';

const API_URL = import.meta.env.VITE_GAS_URL;
const REQUEST_TIMEOUT_MS = 15000;

async function request(options) {
  if (!API_URL) throw new Error('missing_api_url');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error('network');
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('timeout');
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchSlots() {
  const data = await request();
  if (!data.ok) throw new Error(data.reason || 'server_error');
  if (!Array.isArray(data.times) || !Array.isArray(data.slots)) {
    throw new Error('invalid_response');
  }
  return data;
}

function post(payload) {
  return request({
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

export function bookSlot(input) {
  return post({ action: 'book', ...input });
}

export function cancelSlot(input) {
  return post({ action: 'cancel', ...input });
}

export function lookupReservations(input) {
  return post({ action: 'lookup', ...input });
}

export function groupByDate(slots) {
  const grouped = {};
  for (const slot of slots) {
    if (!grouped[slot.date]) grouped[slot.date] = {};
    grouped[slot.date][slot.time] = slot;
  }
  return grouped;
}

const ERROR_MESSAGE = {
  already_booked: '이미 예약된 시간입니다. 다른 시간을 선택해 주세요.',
  expired: '이미 지난 시간입니다. 다른 시간을 선택해 주세요.',
  invalid_input: '입력 정보를 다시 확인해 주세요.',
  invalid_student_id: `학번 ${CONFIG.studentIdLength}자리를 정확히 입력해 주세요.`,
  invalid_phone: '010-1234-5678 형식으로 입력해 주세요.',
  invalid_text: '입력할 수 없는 문자로 시작하거나 내용이 너무 깁니다.',
  not_found: '해당 시간대를 찾을 수 없습니다.',
  no_match: '이름 또는 학번이 일치하지 않습니다.',
  busy: '예약 요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.',
  network: '연결에 실패했습니다. 인터넷 상태를 확인해 주세요.',
  timeout: '응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
  missing_api_url: '예약 서버 주소가 설정되지 않았습니다.',
  invalid_response: '예약 서버의 응답 형식이 올바르지 않습니다.',
  too_late: `실험 ${CONFIG.cancelDeadlineHours}시간 전까지만 취소할 수 있습니다. ${CONFIG.contact}로 연락해 주세요.`,
  not_booked: '이미 취소되었거나 존재하지 않는 예약입니다.',
};

export function messageOf(reason) {
  return ERROR_MESSAGE[reason] || `처리하지 못했습니다. ${CONFIG.contact}로 문의해 주세요.`;
}
