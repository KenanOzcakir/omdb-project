const CONFIG = {
    API_KEY: '4a3b711b',
    API_BASE_URL: 'https://www.omdbapi.com/',
    RESULTS_PER_PAGE: 10,
    STORAGE_KEY: 'omdb_last_search'
};

const state = {
    currentSearch: '',
    currentType: '',
    currentYear: '',
    currentPage: 1,
    totalResults: 0,
    isLoading: false,
    searchCache: new Map()
};

const elements = {
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    typeFilter: document.getElementById('type-filter'),
    yearFilter: document.getElementById('year-filter'),
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message'),
    resultsSection: document.getElementById('results-section'),
    resultsCount: document.getElementById('results-count'),
    resultsGrid: document.getElementById('results-grid'),
    pagination: document.getElementById('pagination'),
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),
    pageInfo: document.getElementById('page-info'),
    modal: document.getElementById('movie-modal'),
    modalBody: document.getElementById('modal-body'),
    closeModal: document.getElementById('close-modal')
};

function init() {
    bindEvents();
    restoreLastSearch();
}

function bindEvents() {
    elements.searchForm.addEventListener('submit', handleSearch);
    
    elements.prevPage.addEventListener('click', () => changePage(-1));
    elements.nextPage.addEventListener('click', () => changePage(1));
    
    elements.closeModal.addEventListener('click', closeModal);
    elements.modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !elements.modal.classList.contains('hidden')) {
            closeModal();
        }
    });
    
    window.addEventListener('popstate', handlePopState);
}

async function handleSearch(e) {
    e.preventDefault();
    
    const query = elements.searchInput.value.trim();
    if (!query) return;
    
    state.currentSearch = query;
    state.currentType = elements.typeFilter.value;
    state.currentYear = elements.yearFilter.value;
    state.currentPage = 1;
    
    updateURL();
    
    saveLastSearch();
    
    await performSearch();
}

async function performSearch() {
    const { currentSearch, currentType, currentYear, currentPage } = state;
    
    const cacheKey = `${currentSearch}-${currentType}-${currentYear}-${currentPage}`;
    
    if (state.searchCache.has(cacheKey)) {
        const cachedData = state.searchCache.get(cacheKey);
        displayResults(cachedData);
        return;
    }
    
    showLoading();
    
    try {
        const params = new URLSearchParams({
            apikey: CONFIG.API_KEY,
            s: currentSearch,
            page: currentPage
        });
        
        if (currentType) params.append('type', currentType);
        if (currentYear) params.append('y', currentYear);
        
        const response = await fetch(`${CONFIG.API_BASE_URL}?${params}`);
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        
        const data = await response.json();
        
        if (data.Response === 'False') {
            showError(data.Error || 'Movie not found');
            return;
        }
        
        state.searchCache.set(cacheKey, data);
        
        state.totalResults = parseInt(data.totalResults, 10);
        
        displayResults(data);
        
    } catch (error) {
        console.error('Search error:', error);
        showError('Unable to connect to the movie database. Please try again later.');
    }
}

function displayResults(data) {
    hideLoading();
    hideError();
    
    const movies = data.Search || [];
    state.totalResults = parseInt(data.totalResults, 10);
    
    elements.resultsCount.textContent = `Found ${state.totalResults.toLocaleString()} results for "${state.currentSearch}"`;
    
    elements.resultsGrid.innerHTML = '';
    
    movies.forEach(movie => {
        const card = createMovieCard(movie);
        elements.resultsGrid.appendChild(card);
    });
    
    elements.resultsSection.classList.remove('hidden');
    
    updatePagination();
}

function createMovieCard(movie) {
    const card = document.createElement('article');
    card.className = 'movie-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View details for ${movie.Title}`);
    
    const posterHTML = movie.Poster && movie.Poster !== 'N/A'
        ? `<img src="${movie.Poster}" alt="${movie.Title} poster" loading="lazy">`
        : `<div class="movie-poster-placeholder">
               <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                   <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
                   <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                   <path d="M21 15L16 10L11 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                   <path d="M14 18L10 14L3 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
           </div>`;
    
    card.innerHTML = `
        <div class="movie-poster">
            ${posterHTML}
            <span class="movie-type-badge">${movie.Type}</span>
        </div>
        <div class="movie-info">
            <h3 class="movie-title">${escapeHTML(movie.Title)}</h3>
            <p class="movie-year">${movie.Year}</p>
        </div>
    `;
    
    card.addEventListener('click', () => showMovieDetail(movie.imdbID));
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showMovieDetail(movie.imdbID);
        }
    });
    
    return card;
}

async function showMovieDetail(imdbID) {
    elements.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    elements.modalBody.innerHTML = `
        <div class="loading" style="padding: 4rem;">
            <div class="spinner"></div>
            <p>Loading movie details...</p>
        </div>
    `;
    
    try {
        const params = new URLSearchParams({
            apikey: CONFIG.API_KEY,
            i: imdbID,
            plot: 'full'
        });
        
        const response = await fetch(`${CONFIG.API_BASE_URL}?${params}`);
        const movie = await response.json();
        
        if (movie.Response === 'False') {
            elements.modalBody.innerHTML = `
                <div class="error-container">
                    <p>Unable to load movie details.</p>
                </div>
            `;
            return;
        }
        
        elements.modalBody.innerHTML = createMovieDetailHTML(movie);
        
    } catch (error) {
        console.error('Detail fetch error:', error);
        elements.modalBody.innerHTML = `
            <div class="error-container">
                <p>Unable to load movie details. Please try again.</p>
            </div>
        `;
    }
}

function createMovieDetailHTML(movie) {
    const posterHTML = movie.Poster && movie.Poster !== 'N/A'
        ? `<img src="${movie.Poster}" alt="${movie.Title} poster">`
        : `<div class="movie-poster-placeholder" style="display: flex; align-items: center; justify-content: center; height: 100%;">
               <svg viewBox="0 0 24 24" fill="none" style="width: 64px; height: 64px;" xmlns="http://www.w3.org/2000/svg">
                   <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
                   <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                   <path d="M21 15L16 10L11 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
           </div>`;
    
    const genres = movie.Genre ? movie.Genre.split(', ').map(g => 
        `<span class="movie-detail-tag">${escapeHTML(g)}</span>`
    ).join('') : 'N/A';
    
    const rating = movie.imdbRating && movie.imdbRating !== 'N/A' 
        ? `<span class="movie-detail-rating">
               <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                   <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
               </svg>
               ${movie.imdbRating}
           </span>`
        : '';
    
    return `
        <div class="movie-detail">
            <div class="movie-detail-poster">
                ${posterHTML}
            </div>
            <div class="movie-detail-content">
                <div class="movie-detail-header">
                    <h2 class="movie-detail-title">${escapeHTML(movie.Title)}</h2>
                    <div class="movie-detail-meta">
                        <span>${movie.Year}</span>
                        <span class="separator">|</span>
                        <span>${movie.Rated || 'Not Rated'}</span>
                        <span class="separator">|</span>
                        <span>${movie.Runtime || 'N/A'}</span>
                        ${rating}
                    </div>
                </div>
                
                <div class="movie-detail-section">
                    <h3 class="movie-detail-section-title">Genre</h3>
                    <div class="movie-detail-tags">
                        ${genres}
                    </div>
                </div>
                
                <div class="movie-detail-section">
                    <h3 class="movie-detail-section-title">Plot</h3>
                    <p>${escapeHTML(movie.Plot) || 'No plot available.'}</p>
                </div>
                
                <div class="movie-detail-section">
                    <div class="movie-detail-info-grid">
                        <div class="movie-detail-info-item">
                            <span class="movie-detail-info-label">Director</span>
                            <span class="movie-detail-info-value">${escapeHTML(movie.Director) || 'N/A'}</span>
                        </div>
                        <div class="movie-detail-info-item">
                            <span class="movie-detail-info-label">Writer</span>
                            <span class="movie-detail-info-value">${escapeHTML(movie.Writer) || 'N/A'}</span>
                        </div>
                        <div class="movie-detail-info-item">
                            <span class="movie-detail-info-label">Actors</span>
                            <span class="movie-detail-info-value">${escapeHTML(movie.Actors) || 'N/A'}</span>
                        </div>
                        <div class="movie-detail-info-item">
                            <span class="movie-detail-info-label">Language</span>
                            <span class="movie-detail-info-value">${escapeHTML(movie.Language) || 'N/A'}</span>
                        </div>
                        <div class="movie-detail-info-item">
                            <span class="movie-detail-info-label">Country</span>
                            <span class="movie-detail-info-value">${escapeHTML(movie.Country) || 'N/A'}</span>
                        </div>
                        <div class="movie-detail-info-item">
                            <span class="movie-detail-info-label">Box Office</span>
                            <span class="movie-detail-info-value">${escapeHTML(movie.BoxOffice) || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                
                ${movie.Awards && movie.Awards !== 'N/A' ? `
                    <div class="movie-detail-section">
                        <h3 class="movie-detail-section-title">Awards</h3>
                        <p>${escapeHTML(movie.Awards)}</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function closeModal() {
    elements.modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function updatePagination() {
    const totalPages = Math.ceil(state.totalResults / CONFIG.RESULTS_PER_PAGE);
    
    if (totalPages <= 1) {
        elements.pagination.classList.add('hidden');
        return;
    }
    
    elements.pagination.classList.remove('hidden');
    elements.pageInfo.textContent = `Page ${state.currentPage} of ${totalPages}`;
    elements.prevPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = state.currentPage >= totalPages;
}

async function changePage(direction) {
    const totalPages = Math.ceil(state.totalResults / CONFIG.RESULTS_PER_PAGE);
    const newPage = state.currentPage + direction;
    
    if (newPage < 1 || newPage > totalPages) return;
    
    state.currentPage = newPage;
    updateURL();
    saveLastSearch();
    
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
    
    await performSearch();
}

function showLoading() {
    state.isLoading = true;
    elements.loading.classList.remove('hidden');
    elements.error.classList.add('hidden');
    elements.resultsSection.classList.add('hidden');
}

function hideLoading() {
    state.isLoading = false;
    elements.loading.classList.add('hidden');
}

function showError(message) {
    hideLoading();
    elements.resultsSection.classList.add('hidden');
    elements.error.classList.remove('hidden');
    
    if (message.includes('not found') || message.includes('Too many')) {
        elements.errorTitle.textContent = 'No Results Found';
        elements.errorMessage.textContent = message === 'Too many results.' 
            ? 'Please be more specific with your search term.'
            : 'We couldn\'t find what you\'re looking for. Try a different search term.';
    } else {
        elements.errorTitle.textContent = 'Something Went Wrong';
        elements.errorMessage.textContent = message;
    }
}

function hideError() {
    elements.error.classList.add('hidden');
}

function updateURL() {
    const params = new URLSearchParams();
    
    if (state.currentSearch) params.set('s', state.currentSearch);
    if (state.currentType) params.set('type', state.currentType);
    if (state.currentYear) params.set('y', state.currentYear);
    if (state.currentPage > 1) params.set('page', state.currentPage);
    
    const newURL = params.toString() ? `?${params}` : window.location.pathname;
    window.history.pushState({
        currentSearch: state.currentSearch,
        currentType: state.currentType,
        currentYear: state.currentYear,
        currentPage: state.currentPage,
        totalResults: state.totalResults
    }, '', newURL);
}

function handlePopState(e) {
    if (e.state) {
        state.currentSearch = e.state.currentSearch || '';
        state.currentType = e.state.currentType || '';
        state.currentYear = e.state.currentYear || '';
        state.currentPage = e.state.currentPage || 1;
        
        elements.searchInput.value = state.currentSearch;
        elements.typeFilter.value = state.currentType;
        elements.yearFilter.value = state.currentYear;
        
        if (state.currentSearch) {
            performSearch();
        }
    }
}

function saveLastSearch() {
    const searchData = {
        search: state.currentSearch,
        type: state.currentType,
        year: state.currentYear,
        page: state.currentPage,
        timestamp: Date.now()
    };
    
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(searchData));
    } catch (e) {
        console.warn('Unable to save to localStorage:', e);
    }
}

function restoreLastSearch() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlSearch = urlParams.get('s');
    
    if (urlSearch) {
        state.currentSearch = urlSearch;
        state.currentType = urlParams.get('type') || '';
        state.currentYear = urlParams.get('y') || '';
        state.currentPage = parseInt(urlParams.get('page'), 10) || 1;
        
        elements.searchInput.value = state.currentSearch;
        elements.typeFilter.value = state.currentType;
        elements.yearFilter.value = state.currentYear;
        
        performSearch();
        return;
    }
    
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            
            if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                state.currentSearch = data.search || '';
                state.currentType = data.type || '';
                state.currentYear = data.year || '';
                state.currentPage = data.page || 1;
                
                elements.searchInput.value = state.currentSearch;
                elements.typeFilter.value = state.currentType;
                elements.yearFilter.value = state.currentYear;
                
                if (state.currentSearch) {
                    performSearch();
                }
            }
        }
    } catch (e) {
        console.warn('Unable to restore from localStorage:', e);
    }
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
