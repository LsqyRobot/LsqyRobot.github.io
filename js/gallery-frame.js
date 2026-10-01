(() => {
  const filters = document.querySelector('.gallery-filters');
  if (!filters) return;
  const buttons = [...filters.querySelectorAll('button')];
  const cards = [...document.querySelectorAll('[data-gallery-category]')];
  const status = document.querySelector('.gallery-result');
  const matches = (card, category) => category === 'all' || card.dataset.galleryCategory === category || card.dataset.galleryAlbum === category;
  buttons.forEach(button => {
    const category = button.dataset.galleryFilter;
    button.querySelector('span').textContent = cards.filter(card => matches(card, category)).length;
    button.addEventListener('click', () => {
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      cards.forEach(card => { card.hidden = !matches(card, category); });
      const label = button.firstChild.textContent.trim();
      status.textContent = `${label} · ${cards.filter(card => !card.hidden).length} 张`;
    });
  });
  status.textContent = `共 ${cards.length} 张 · 慢慢收藏`;
  filters.hidden = false;
})();
