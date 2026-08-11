import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchSlots, groupByDate } from '../api/reservation';

export function useSlots() {
  const [times, setTimes] = useState([]);
  const [byDate, setByDate] = useState({});
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const data = await fetchSlots();
      if (currentRequest !== requestId.current) return;

      const grouped = groupByDate(data.slots);
      setTimes(data.times);
      setByDate(grouped);
      setDates(Object.keys(grouped).sort());
    } catch (loadError) {
      if (currentRequest === requestId.current) setError(loadError.message);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return { times, byDate, dates, loading, error, reload: load };
}
