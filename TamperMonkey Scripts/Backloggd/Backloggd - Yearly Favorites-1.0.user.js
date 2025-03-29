// ==UserScript==
// @name         Backloggd - Yearly Favorites
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds a Favorite Games of [CURRENT YEAR] Tab to every Backloggd Profile that Qualifies for it.
// @author       CyanLimes
// @match        https://backloggd.com/u/*
// @match        https://www.backloggd.com/u/*
// @match        https://backloggd.com/*
// @match        https://www.backloggd.com/*
// @grant        GM_xmlhttpRequest
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js
// ==/UserScript==

//Most Recent Update 1.2: Fixed a bug where clicking any navigation link on the profile and returning duplicates the top 5.

(function() {
    'use strict';
    const CURRENT_YEAR = new Date().getFullYear();
    const CATEGORIES = 'main_game,remake';
    let abortController = null;
    let isProcessing = false;

    const style = document.createElement('style');
    style.textContext = `
    #yearly-favorites-section {display: none !important;}
    #yearly-favorites-section:last-of-type {display: block !important;}`;

    async function fetchYearlyGames(username) {
        try {
            // Abort previous request if still pending
            if (abortController) abortController.abort();
            abortController = new AbortController();

            const response = await fetch(
                `/u/${username}/games/user-rating/type:played;release_year:${CURRENT_YEAR};category:${CATEGORIES}`,
                { signal: abortController.signal }
            );

            const responseText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(responseText, 'text/html');

            return Array.from(doc.querySelectorAll('.col-cus-5')).map(game => {
                const starContainer = game.querySelector('.star-ratings-static');
                return {
                    name: game.querySelector('.game-text-centered').textContent.trim(),
                    image: game.querySelector('.card-img').src,
                    slug: game.querySelector('a').href.split('/')[4],
                    ratingWidth: starContainer ?
                        starContainer.querySelector('.stars-top').style.width : '0%'
                };
            });

        } catch (error) {
            if (error.name !== 'AbortError') console.error('Fetch error:', error);
            return [];
        }
    }

    function createYearlySection(games, username) {
        const section = document.createElement('div');
        section.className = 'row mt-3';
        section.innerHTML = `
            <div class="col pl-md-4">
                <div class="row">
                    <div class="col">
                        <h2 class="mb-0 profile-section-header" style="font-weight: bold;">
                            Favorite Games of ${CURRENT_YEAR}
                            <a href="/u/${username}/games/user-rating/type:played;release_year:${CURRENT_YEAR};category:${CATEGORIES}"
                               class="secondary-link subtitle-text"
                               style="font-size: 0.9rem">
                                See More
                            </a>
                        </h2>
                    </div>
                </div>
                <div class="row mx-n1 mb-3 justify-content-center" id="yearly-favorites">
                    ${games.slice(0, 5).map(game => `
                        <div class="col-cus-5 mb-2 px-1">
                            <a href="/games/${game.slug}/" class="game-card-link">
                                <div class="card mx-auto game-cover quick-access fade-played" style="width: auto">
                                    <div class="overflow-wrapper">
                                        <img class="lazy card-img height entered loaded"
                                             src="${game.image}"
                                             style="width: 100%; height: 100%"
                                             data-ll-status="loaded">
                                        <div class="overlay"></div>
                                    </div>
                                    <div class="game-text-centered">${game.name}</div>
                                    ${game.ratingWidth !== '0%' ? `
                                    <div class="row star-ratings-static" style="position: absolute; bottom: -35px; right: 30px;">
                                        <div class="stars-top" style="width: ${game.ratingWidth}">
                                            <span class="star"></span>
                                            <span class="star"></span>
                                            <span class="star"></span>
                                            <span class="star"></span>
                                            <span class="star"></span>
                                        </div>
                                        <div class="stars-bottom">
                                            <span class="star"></span>
                                            <span class="star"></span>
                                            <span class="star"></span>
                                            <span class="star"></span>
                                            <span class="star"></span>
                                        </div>
                                    </div>
                                    ` : ''}
                                </div>
                            </a>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        return section;
    }

    async function main() {
        if (isProcessing) return;
        isProcessing = true;

        // Capture the current username from the URL at the start.
        const currentUsername = window.location.pathname.split('/')[2];
        if (!currentUsername) {
            isProcessing = false;
            return;
        }

        try {
            // Always remove existing section first
            const existingSection = document.querySelector('#yearly-favorites-section');
            if (existingSection) existingSection.remove();

            const games = await fetchYearlyGames(currentUsername);
            if (games.length === 0) {
                isProcessing = false;
                return;
            }

            const insertSection = () => {
                // Re-check the username before inserting.
                const usernameAfterFetch = window.location.pathname.split('/')[2];
                if (usernameAfterFetch !== currentUsername) {
                    // The profile has changed since the request started; do not insert outdated data.
                    isProcessing = false;
                    return;
                }

                const mainContent = document.querySelector('.col.pl-md-4');
                const profileStats = document.querySelector('#profile-stats');

                if (mainContent && profileStats) {
                    const yearlySection = createYearlySection(games, currentUsername);
                    yearlySection.id = 'yearly-favorites-section';
                    mainContent.insertBefore(yearlySection, profileStats);
                    isProcessing = false;
                } else {
                    setTimeout(insertSection, 100);
                }
            };

            insertSection();

        } catch (error) {
            console.error('Insertion error:', error);
            isProcessing = false;
        }
    }


    // Enhanced navigation detection
    const observeProfileChanges = () => {
        // 1. Observe the main content container directly
        const contentObserver = new MutationObserver((mutations) => {
            if (document.querySelector('#profile-stats')) {
                main();
            }
        });

        // 2. Monitor both AJAX navigation and history changes
        const pushState = history.pushState;
        history.pushState = function() {
            pushState.apply(history, arguments);
            setTimeout(main, 300);
        };

        // 3. Special handler for navbar profile clicks
        document.addEventListener('click', (e) => {
            const navLink = e.target.closest('.btn, .btn-small, .btn-general, .nav-link, .game-card-link, .secondary-link, .open-review-link, .comments-link');
            if (navLink) {
                isProcessing = false;
                document.querySelectorAll('#yearly-favorites-section').forEach(el => el.remove());
            }
        });

        // Start observing
        const mainContainer = document.querySelector('.container');
        if (mainContainer) {
            contentObserver.observe(mainContainer, {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: false
            });
        }

        window.addEventListener('popstate', main);
        window.addEventListener('replacestate', main);
    };

    // Initialization
    if (document.readyState === 'complete') {
        observeProfileChanges();
        main();
    } else {
        window.addEventListener('load', () => {
            observeProfileChanges();
            main();
        });
    }
})();