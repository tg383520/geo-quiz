document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 요소 캐싱 ---
    const appContainer = document.getElementById('app-container');
    const startScreen = document.getElementById('start-screen');
    const quizScreen = document.getElementById('quiz-screen');
    const resultsScreen = document.getElementById('results-screen');
    const startButtons = {
        flag: document.getElementById('start-flag-quiz'),
        capital: document.getElementById('start-capital-quiz'),
        mapFind: document.getElementById('start-map-find-quiz'),
        mapGuess: document.getElementById('start-map-guess-quiz'),
    };
    const questionCounter = document.getElementById('question-counter');
    const scoreDisplay = document.getElementById('score');
    const progressBarInner = document.getElementById('progress-bar-inner');
    const questionArea = document.getElementById('question-area');
    const optionsArea = document.getElementById('options-area');
    const instructionText = document.getElementById('instruction-text');
    const nextQuestionBtn = document.getElementById('next-question-btn');
    const backToMainDuringQuizBtn = document.getElementById('back-to-main-during-quiz-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const finalScoreDisplay = document.getElementById('final-score');
    const resultMessageDisplay = document.getElementById('result-message');
    const playAgainSameQuizBtn = document.getElementById('play-again-same-quiz-btn');
    const backToMainBtn = document.getElementById('back-to-main-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const majorCountriesToggle = document.getElementById('major-countries-toggle');
    const questionTypeToggle = document.getElementById('question-type-toggle');

    // --- 게임 상태 변수 ---
    let apiCountries = [];
    let mapQuizCountries = [];
    let currentQuizData = [];
    let currentQuestionIndex = 0;
    let score = 0;
    let quizType = '';
    const TOTAL_QUESTIONS = 10;
    let worldMapSVG = null;
    let originalViewBox = null;
    let isPanning = false;
    let isRightMouseDown = false;
    let lastMousePos = { x: 0, y: 0 };
    let initialPinchDistance = null;

    let settings = {
        majorCountriesOnly: false,
        questionType: 'multiple' // 'multiple' or 'subjective'
    };

    const MAJOR_COUNTRY_CODES = ['AR', 'AU', 'AT', 'BD', 'BE', 'BR', 'BG', 'CA', 'CL', 'CN', 'CO', 'HR', 'CU', 'CZ', 'DK', 'EG', 'ET', 'FI', 'FR', 'DE', 'GH', 'GR', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IL', 'IT', 'JP', 'KZ', 'KE', 'KP', 'KR', 'KW', 'LT', 'LU', 'MG', 'MY', 'MX', 'MC', 'MN', 'MA', 'NL', 'NZ', 'NO', 'PK', 'PE', 'PH', 'PL', 'PT', 'QA', 'RO', 'RU', 'SA', 'RS', 'SG', 'SK', 'SI', 'ZA', 'ES', 'SE', 'CH', 'TH', 'TR', 'UA', 'AE', 'GB', 'UY', 'VN', 'US', 'NG', 'VE'];

    // --- 데이터 예외 처리 ---
    const countryNameOverrides = {
        'KP': '조선민주주의인민공화국',
        'AU': '오스트레일리아',
    };
    const capitalNameOverrides = {};
    const countryBlacklist = ['gl'];

    // --- 유틸리티 함수 ---
    const getCountryName = (country) => {
        return countryNameOverrides[country.cca2] || country.translations?.kor?.common || country.name.common;
    };

    const getCapitalName = (country) => {
        const capital = country.capital[0];
        return capitalNameOverrides[capital] || capital;
    };

    // --- 데이터 및 SVG 로드 ---
    async function initializeGameData() {
        try {
            document.querySelectorAll('.quiz-btn').forEach(btn => btn.disabled = true);
            const [countriesResponse, mapResponse] = await Promise.all([
                fetch('https://restcountries.com/v3.1/all?fields=name,capital,flags,cca2,cca3,translations'),
                fetch('./map.svg')
            ]);

            if (!countriesResponse.ok) throw new Error(`국가 데이터 로드 실패: ${countriesResponse.status}`);
            if (!mapResponse.ok) throw new Error(`지도 데이터 로드 실패: ${mapResponse.status}`);

            apiCountries = (await countriesResponse.json()).filter(c => c.capital?.length > 0 && c.cca2 && c.cca3 && c.translations?.kor);

            const mapText = await mapResponse.text();
            const parser = new DOMParser();
            worldMapSVG = parser.parseFromString(mapText, 'image/svg+xml').documentElement;
            if (!worldMapSVG) throw new Error('SVG 파싱 실패');
            originalViewBox = worldMapSVG.getAttribute('viewBox');

            const svgElements = Array.from(worldMapSVG.querySelectorAll('*[id]'));

            let mappedCountries = svgElements.map(element => {
                const id = element.id.toLowerCase();
                if (countryBlacklist.includes(id)) return null;

                if (id === '_somaliland') {
                    const somaliaData = apiCountries.find(c => c.cca2.toLowerCase() === 'so');
                    if (somaliaData) {
                        return {
                            ...somaliaData,
                            svgId: '_somaliland',
                            name: { ...somaliaData.name, common: 'Somaliland' },
                            translations: {
                                ...somaliaData.translations,
                                kor: { ...somaliaData.translations.kor, common: '소말릴란드' }
                            }
                        };
                    }
                    return null;
                }

                const country = apiCountries.find(c => c.cca2.toLowerCase() === id || c.cca3.toLowerCase() === id);
                return country ? { ...country, svgId: id } : null;
            });
            mapQuizCountries = mappedCountries.filter(Boolean);

            document.querySelectorAll('.quiz-btn').forEach(btn => btn.disabled = false);
        } catch (error) {
            console.error("게임 초기화 실패:", error);
            document.getElementById('main-content').innerHTML = '<p>퀴즈 데이터를 불러오는 데 실패했습니다. 페이지를 새로고침 해주세요.</p>';
        }
    }

    // --- 퀴즈 로직 ---
    function startQuiz(type) {
        quizType = type;
        currentQuestionIndex = 0;
        score = 0;
        updateScoreDisplay();
        appContainer.classList.toggle('map-quiz-mode', quizType.startsWith('map'));
        prepareQuizData();
        if (!currentQuizData) return;
        startScreen.classList.add('hidden');
        resultsScreen.classList.add('hidden');
        quizScreen.classList.remove('hidden');
        nextQuestionBtn.classList.add('hidden');
        displayQuestion();
    }

    function prepareQuizData() {
        let sourceCountries = quizType.startsWith('map') ? mapQuizCountries : apiCountries;

        if (settings.majorCountriesOnly) {
            sourceCountries = sourceCountries.filter(country => MAJOR_COUNTRY_CODES.includes(country.cca2));
        }

        if (sourceCountries.length < TOTAL_QUESTIONS) {
            const message = settings.majorCountriesOnly
                ? `주요 국가 퀴즈를 위한 데이터가 부족합니다. (필요: ${TOTAL_QUESTIONS}, 가능: ${sourceCountries.length})`
                : `퀴즈를 위한 데이터가 부족합니다. (필요: ${TOTAL_QUESTIONS}, 가능: ${sourceCountries.length})`;
            alert(message);
            currentQuizData = null;
            goBackToMainMenu();
            return;
        }
        const shuffled = [...sourceCountries];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        currentQuizData = shuffled.slice(0, TOTAL_QUESTIONS);
    }

    function displayQuestion() {
        resetQuestionState();
        if (currentQuestionIndex >= TOTAL_QUESTIONS) {
            showResults();
            return;
        }
        const question = currentQuizData[currentQuestionIndex];
        updateProgress();
        const questionHandlers = {
            flag: displayFlagQuestion,
            capital: displayCapitalQuestion,
            'map-find': displayMapFindQuestion,
            'map-guess': displayMapGuessQuestion
        };
        questionHandlers[quizType]?.(question);
    }
    
    function nextQuestion() {
        currentQuestionIndex++;
        displayQuestion();
    }

    // --- 질문 유형별 표시 함수 ---
    function displayFlagQuestion(question) {
        questionArea.innerHTML = `<img id="flag-image" src="${question.flags.svg}" alt="국기">`;
        if (settings.questionType === 'subjective') {
            renderSubjectiveInput(question);
        } else {
            generateMultipleChoiceOptions(question, 'name');
        }
    }

    function displayCapitalQuestion(question) {
        questionArea.innerHTML = `<p id="country-name-question">'${getCountryName(question)}'의 수도는?</p>`;
        if (settings.questionType === 'subjective') {
            instructionText.textContent = "수도는 영어로 입력해주세요.";
            instructionText.classList.remove('hidden');
            renderSubjectiveInput(question);
        } else {
            generateMultipleChoiceOptions(question, 'capital');
        }
    }

    function displayMapFindQuestion(question) {
        const questionEl = document.createElement('p');
        questionEl.id = 'country-name-question';
        questionEl.textContent = `'${getCountryName(question)}'을(를) 지도에서 찾아보세요.`;
        instructionText.textContent = 'PC: 우클릭, 모바일: 두 손가락으로 확대/이동';
        instructionText.classList.remove('hidden');
        const mapEl = renderMap(handleMapClick, question);
        questionArea.innerHTML = '';
        questionArea.append(questionEl, mapEl);
    }

    function displayMapGuessQuestion(question) {
        instructionText.textContent = '지도에 표시된 국가는 어디일까요?';
        instructionText.classList.remove('hidden');
        const mapEl = renderMap(() => {}, question, { highlight: true, arrow: true });
        questionArea.innerHTML = '';
        questionArea.appendChild(mapEl);
        if (settings.questionType === 'subjective') {
            renderSubjectiveInput(question);
        } else {
            generateMultipleChoiceOptions(question, 'name');
        }
    }

    // --- 선택지 및 지도 처리 ---
    function renderSubjectiveInput(question) {
        optionsArea.innerHTML = `
            <div class="subjective-input-container">
                <input type="text" id="subjective-answer-input" placeholder="정답을 입력하세요...">
                <button id="subjective-submit-btn">제출</button>
            </div>
        `;
        document.getElementById('subjective-submit-btn').addEventListener('click', () => handleSubjectiveSubmit(question));
        const inputEl = document.getElementById('subjective-answer-input');
        inputEl.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation(); // Enter 키 이벤트가 window로 전파되는 것을 막음
                handleSubjectiveSubmit(question);
            }
        });
        // 입력창이 DOM에 렌더링된 후 포커스를 맞추기 위해 setTimeout 사용
        setTimeout(() => inputEl.focus(), 0);
    }

    function handleSubjectiveSubmit(question) {
        const inputElement = document.getElementById('subjective-answer-input');
        const userAnswer = inputElement.value.trim().toLowerCase();

        if (!userAnswer) return; // 빈칸 제출 방지

        let isCorrect = false;
        const country = currentQuizData[currentQuestionIndex];
        const primaryAnswer = (quizType === 'flag' || quizType === 'map-guess') ? getCountryName(question) : getCapitalName(question);

        const correctAnswers = [];

        if (quizType === 'flag' || quizType === 'map-guess') {
            // API 제공 이름 추가
            correctAnswers.push(country.name.common.toLowerCase());
            correctAnswers.push(country.name.official.toLowerCase());
            if (country.altSpellings) {
                country.altSpellings.forEach(alt => correctAnswers.push(alt.toLowerCase()));
            }
            // 한국어 이름 추가
            correctAnswers.push(country.translations.kor.common.toLowerCase());
            correctAnswers.push(country.translations.kor.official.toLowerCase());
            
            // 별칭 수동 추가
            const manualAliases = {
                'KR': ['한국', 'south korea'],
                'KP': ['북한', 'north korea'],
                'US': ['미국', 'united states of america'],
                'GB': ['영국', 'uk', 'united kingdom'],
                'JP': ['일본'],
                'CN': ['중국']
            };
            if (manualAliases[country.cca2]) {
                manualAliases[country.cca2].forEach(a => correctAnswers.push(a.toLowerCase()));
            }

            isCorrect = [...new Set(correctAnswers)].includes(userAnswer);

        } else { // 수도 퀴즈
            const capital = getCapitalName(question).toLowerCase();
            correctAnswers.push(capital);
            isCorrect = (userAnswer === capital);
        }

        showFeedback(isCorrect, inputElement, primaryAnswer);
    }
    function generateMultipleChoiceOptions(correctAnswer, type) {
        const source = quizType.startsWith('map') ? mapQuizCountries : apiCountries;
        const correctOptionValue = type === 'name' ? getCountryName(correctAnswer) : getCapitalName(correctAnswer);
        const incorrectOptions = [...new Set(source.map(c => type === 'name' ? getCountryName(c) : getCapitalName(c)))].filter(opt => opt && opt !== correctOptionValue);
        const finalOptions = [correctOptionValue, ...incorrectOptions.sort(() => 0.5 - Math.random()).slice(0, 3)];
        optionsArea.innerHTML = '';
        finalOptions.sort(() => 0.5 - Math.random()).forEach(optionText => {
            const button = document.createElement('button');
            button.textContent = optionText;
            button.classList.add('option-btn');
            button.addEventListener('click', () => handleOptionClick(button, optionText, correctAnswer));
            optionsArea.appendChild(button);
        });
    }

    function renderMap(clickCallback, question, effects = {}) {
        const mapContainer = document.createElement('div');
        mapContainer.id = 'map-container';
        const clonedMap = worldMapSVG.cloneNode(true);
        clonedMap.removeAttribute('width');
        clonedMap.removeAttribute('height');
        clonedMap.id = 'world-map-svg';
        clonedMap.setAttribute('viewBox', originalViewBox);
        mapContainer.appendChild(clonedMap);

        mapContainer.addEventListener('contextmenu', e => e.preventDefault());
        mapContainer.addEventListener('mousedown', handleMouseDown);
        mapContainer.addEventListener('wheel', handleWheelZoom, { passive: false });
        mapContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
        mapContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        mapContainer.addEventListener('touchend', handleTouchEnd);

        mapQuizCountries.forEach(country => {
            const el = clonedMap.querySelector(`#${CSS.escape(country.svgId)}`);
            if (el) {
                el.classList.add('country');
                el.addEventListener('click', (e) => {
                    if (!isPanning) clickCallback(e, question);
                });
            }
        });

        const countryElement = clonedMap.querySelector(`#${CSS.escape(question.svgId)}`);
        if (effects.highlight && countryElement) {
            countryElement.classList.add('highlight');
        }
        
        if (effects.arrow && countryElement) {
            setTimeout(() => {
                try {
                    const bbox = getElementBBox(countryElement);
                    if (bbox) addPointerArrow(clonedMap, bbox);
                } catch (e) {
                    console.warn(`[WARN] ${getCountryName(question)} 국가의 화살표를 그리는데 실패했습니다.`, e);
                }
            }, 0);
        }
        return mapContainer;
    }

    function getElementBBox(element) {
        if (!element) return null;
        if (element.tagName.toLowerCase() === 'g') {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            element.querySelectorAll('path').forEach(p => {
                const pbox = p.getBBox();
                if (pbox.width === 0 && pbox.height === 0) return;
                minX = Math.min(minX, pbox.x);
                minY = Math.min(minY, pbox.y);
                maxX = Math.max(maxX, pbox.x + pbox.width);
                maxY = Math.max(maxY, pbox.y + pbox.height);
            });
            return isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
        } else {
            return element.getBBox();
        }
    }

    function addPointerArrow(svg, bbox) {
        if (!bbox || bbox.width === 0 || bbox.height === 0) return;
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const arrowSize = 20;
        const targetX = bbox.x + bbox.width / 2;
        const targetY = bbox.y - arrowSize / 2;
        arrow.setAttribute('d', `M ${targetX} ${targetY} l -${arrowSize/2} -${arrowSize} h ${arrowSize} z`);
        arrow.classList.add('pointer-arrow');
        svg.appendChild(arrow);
    }

    // --- 지도 상호작용 핸들러 ---
    function handleMouseDown(event) {
        if (event.button !== 2) return;
        isRightMouseDown = true;
        isPanning = false;
        lastMousePos = { x: event.clientX, y: event.clientY };
        const onMouseMove = (e) => {
            if (!isPanning && (Math.abs(e.clientX - lastMousePos.x) > 5 || Math.abs(e.clientY - lastMousePos.y) > 5)) {
                isPanning = true;
            }
            if (isPanning) handlePan(e.clientX, e.clientY);
        };
        const onMouseUp = () => {
            isRightMouseDown = false;
            setTimeout(() => { isPanning = false; }, 0);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function handlePan(currentX, currentY) {
        const svg = questionArea.querySelector('#world-map-svg');
        if (!svg) return;
        const dx = currentX - lastMousePos.x;
        const dy = currentY - lastMousePos.y;
        const viewBox = svg.getAttribute('viewBox').split(' ').map(Number);
        const scale = viewBox[2] / svg.getBoundingClientRect().width;
        viewBox[0] -= dx * scale;
        viewBox[1] -= dy * scale;
        svg.setAttribute('viewBox', viewBox.join(' '));
        lastMousePos = { x: currentX, y: currentY };
    }

    function handleWheelZoom(event) {
        if (!isRightMouseDown) return;
        event.preventDefault();
        zoomAtPoint(event.deltaY, event.clientX, event.clientY);
    }

    function zoomAtPoint(delta, clientX, clientY) {
        const svg = questionArea.querySelector('#world-map-svg');
        if (!svg) return;

        const originalWidth = parseFloat(originalViewBox.split(' ')[2]);
        const maxZoomWidth = originalWidth / 15; // Max zoom-in (smallest width)
        const minZoomWidth = originalWidth;      // Max zoom-out (largest width)

        const point = new DOMPoint(clientX, clientY);
        const transformedPoint = point.matrixTransform(svg.getScreenCTM().inverse());
        const currentViewBox = svg.getAttribute('viewBox').split(' ').map(Number);
        const [x, y, width, height] = currentViewBox;
        
        const zoomFactor = 1.25;
        let newWidth = delta < 0 ? width / zoomFactor : width * zoomFactor;

        // Clamp the new width to the zoom limits
        if (newWidth < maxZoomWidth) newWidth = maxZoomWidth;
        if (newWidth > minZoomWidth) newWidth = minZoomWidth;
        
        // Prevent further zooming if limits are hit
        if (newWidth === width) return;

        const newHeight = newWidth * (height / width);

        const newX = transformedPoint.x - (transformedPoint.x - x) * (newWidth / width);
        const newY = transformedPoint.y - (transformedPoint.y - y) * (newHeight / height);

        svg.setAttribute('viewBox', `${newX} ${newY} ${newWidth} ${newHeight}`);
        zoomOutBtn.classList.toggle('hidden', newWidth >= originalWidth);
    }

    // --- 모바일 터치 핸들러 ---
    function handleTouchStart(event) {
        if (event.touches.length === 1) {
            isPanning = false;
            lastMousePos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        } else if (event.touches.length === 2) {
            event.preventDefault();
            isPanning = true;
            initialPinchDistance = Math.hypot(
                event.touches[0].clientX - event.touches[1].clientX,
                event.touches[0].clientY - event.touches[1].clientY
            );
        }
    }

    function handleTouchMove(event) {
        event.preventDefault();
        if (event.touches.length === 1 && !initialPinchDistance) {
             if (!isPanning && (Math.abs(event.touches[0].clientX - lastMousePos.x) > 5 || Math.abs(event.touches[0].clientY - lastMousePos.y) > 5)) {
                isPanning = true;
            }
            if(isPanning) {
                handlePan(event.touches[0].clientX, event.touches[0].clientY);
            }
        } else if (event.touches.length === 2) {
            const newPinchDistance = Math.hypot(
                event.touches[0].clientX - event.touches[1].clientX,
                event.touches[0].clientY - event.touches[1].clientY
            );
            const zoomSensitivity = 0.8; // Lower is less sensitive
            const zoomDelta = (initialPinchDistance - newPinchDistance) * zoomSensitivity;
            
            const midPointX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
            const midPointY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
            
            zoomAtPoint(zoomDelta, midPointX, midPointY);

            initialPinchDistance = newPinchDistance;
        }
    }

    function handleTouchEnd(event) {
        if (event.touches.length < 2) {
            initialPinchDistance = null;
        }
        if (event.touches.length < 1) {
            setTimeout(() => { isPanning = false; }, 0);
        }
    }

    // --- 정답 처리 ---
    function handleOptionClick(button, selectedOption, question) {
        const correctOption = (quizType === 'flag' || quizType === 'map-guess') ? getCountryName(question) : getCapitalName(question);
        showFeedback(selectedOption === correctOption, button, correctOption);
    }

    function handleMapClick(event, question) {
        const countryElement = event.target.closest('.country');
        if (countryElement) {
            const clickedId = countryElement.id.toLowerCase();
            const isCorrect = clickedId === question.svgId;
            showFeedback(isCorrect, countryElement, getCountryName(question));
        }
    }

    function showFeedback(isCorrect, answeredElement, correctOptionText) {
        questionArea.querySelectorAll('.country').forEach(el => el.style.pointerEvents = 'none');
        optionsArea.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
        document.getElementById('subjective-submit-btn')?.setAttribute('disabled', 'true');
        document.getElementById('subjective-answer-input')?.setAttribute('disabled', 'true');

        if (isCorrect) {
            score++;
            answeredElement.classList.add('correct');
        } else {
            answeredElement.classList.add('incorrect');
            
            // 주관식 오답 시 정답 표시
            if (settings.questionType === 'subjective') {
                const correctAnswerDisplay = document.createElement('p');
                correctAnswerDisplay.textContent = `정답: ${correctOptionText}`;
                correctAnswerDisplay.classList.add('correct-answer-text');
                optionsArea.appendChild(correctAnswerDisplay);
            }

            const correctSvgId = currentQuizData[currentQuestionIndex].svgId;
            const correctElement = questionArea.querySelector(`#${CSS.escape(correctSvgId)}`);
            if (correctElement) {
                correctElement.classList.add('highlight');
                const svg = questionArea.querySelector('#world-map-svg');
                try {
                    const bbox = getElementBBox(correctElement);
                    if (bbox) addPointerArrow(svg, bbox);
                } catch(e) {
                    console.warn("오답 시 정답 화살표 표시에 실패했습니다.", e);
                }
            }
            // 객관식 오답 시 정답 버튼 표시
            optionsArea.querySelectorAll('.option-btn').forEach(btn => {
                if (btn.textContent === correctOptionText) btn.classList.add('correct');
            });
        }
        updateScoreDisplay();
        nextQuestionBtn.classList.remove('hidden');
    }

    // --- UI 업데이트 및 상태 관리 ---
    function updateScoreDisplay() { scoreDisplay.textContent = `점수: ${score}`; }

    function updateProgress() {
        progressBarInner.style.width = `${((currentQuestionIndex + 1) / TOTAL_QUESTIONS) * 100}%`;
        questionCounter.textContent = `문제 ${currentQuestionIndex + 1} / ${TOTAL_QUESTIONS}`;
    }

    function resetQuestionState() {
        questionArea.innerHTML = '';
        optionsArea.innerHTML = '';
        instructionText.classList.add('hidden');
        nextQuestionBtn.classList.add('hidden');
        zoomOutBtn.classList.add('hidden');
    }

    function goBackToMainMenu() {
        appContainer.classList.remove('map-quiz-mode');
        quizScreen.classList.add('hidden');
        resultsScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    }

    function showResults() {
        quizScreen.classList.add('hidden');
        resultsScreen.classList.remove('hidden');
        finalScoreDisplay.textContent = `${score} / ${TOTAL_QUESTIONS}`;
        const percentage = (score / TOTAL_QUESTIONS) * 100;
        resultMessageDisplay.textContent = 
            percentage === 100 ? '🎉 완벽해요! 당신은 지리 마스터!' :
            percentage >= 70 ? '훌륭해요! 정말 잘 아시는군요!' :
            percentage >= 40 ? '좋아요! 조금 더 배워볼까요?' :
                               '아쉬워요. 다시 도전해보세요!';
    }

    // --- 이벤트 리스너 설정 ---
    Object.values(startButtons).forEach(btn => btn.addEventListener('click', () => startQuiz(btn.id.replace('start-', '').replace('-quiz', ''))));
    nextQuestionBtn.addEventListener('click', nextQuestion);
    playAgainSameQuizBtn.addEventListener('click', () => startQuiz(quizType));
    backToMainBtn.addEventListener('click', goBackToMainMenu);
    backToMainDuringQuizBtn.addEventListener('click', goBackToMainMenu);
    zoomOutBtn.addEventListener('click', () => {
        const svg = questionArea.querySelector('#world-map-svg');
        if (svg) svg.setAttribute('viewBox', originalViewBox);
        zoomOutBtn.classList.add('hidden');
    });

    // 설정 모달
    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    majorCountriesToggle.addEventListener('change', (e) => {
        settings.majorCountriesOnly = e.target.checked;
    });

    questionTypeToggle.addEventListener('change', (e) => {
        settings.questionType = e.target.checked ? 'subjective' : 'multiple';
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' && !nextQuestionBtn.classList.contains('hidden')) {
            nextQuestionBtn.click();
        }
    });

    // --- 초기화 ---
    initializeGameData();
});