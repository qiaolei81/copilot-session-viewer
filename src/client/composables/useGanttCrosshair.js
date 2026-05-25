import { ref } from 'vue';

export function useGanttCrosshair(sessionStart, totalDuration) {
  const ganttCrosshairX = ref(null);
  const ganttCrosshairTime = ref('');

  const onGanttMouseMove = (e) => {
    const container = e.currentTarget;
    const barArea = container.querySelector('.gantt-bar-area');
    if (!barArea) return;
    const barRect = barArea.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const barLeft = barRect.left - containerRect.left;
    const barRight = barLeft + barRect.width;
    const mouseX = e.clientX - containerRect.left;

    if (mouseX >= barLeft && mouseX <= barRight) {
      ganttCrosshairX.value = mouseX;
      const pct = (mouseX - barLeft) / barRect.width;
      const ts = sessionStart.value + pct * totalDuration.value;
      const d = new Date(ts);
      ganttCrosshairTime.value =
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0') + ':' +
        String(d.getSeconds()).padStart(2, '0');
    } else {
      ganttCrosshairX.value = null;
    }
  };

  const onGanttMouseLeave = () => { ganttCrosshairX.value = null; };

  return { ganttCrosshairX, ganttCrosshairTime, onGanttMouseMove, onGanttMouseLeave };
}
