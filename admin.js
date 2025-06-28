document.getElementById('pointsForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const userId = document.getElementById('userId').value.trim();
  const points = Number(document.getElementById('points').value);
  const note = document.getElementById('note').value.trim();

  const resultDiv = document.getElementById('result');
  resultDiv.textContent = 'กำลังดำเนินการ...';

  try {
    const res = await fetch('/admin/update-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, points, note })
    });
    const data = await res.json();
    if (data.success) {
      resultDiv.textContent = 'อัปเดตแต้มสำเร็จ!';
      resultDiv.className = 'mt-3 text-success';
    } else {
      resultDiv.textContent = 'เกิดข้อผิดพลาด: ' + (data.message || 'ไม่ทราบสาเหตุ');
      resultDiv.className = 'mt-3 text-danger';
    }
  } catch (err) {
    resultDiv.textContent = 'เกิดข้อผิดพลาด: ' + err.message;
    resultDiv.className = 'mt-3 text-danger';
  }
});