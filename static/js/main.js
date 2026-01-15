// ==================== GLOBAL VARIABLES ====================
let dotInterval = null;

// ==================== DISCLAIMER ====================
window.addEventListener('load', function() {
    alert('⚠️ DISCLAIMER\n\nUse this tool responsibly and ethically.\n\nAny form of misuse, unauthorized access, or illegal activities is strictly prohibited and is the sole responsibility of the user.\n\nThis tool is intended for authorized security testing only.');
});

// ==================== LOADING ANIMATION ====================
function startLoadingAnimation() {
    let dotCount = 1;
    const dotsElement = document.getElementById('loadingDots');
    
    if (dotInterval) clearInterval(dotInterval);
    
    dotInterval = setInterval(() => {
        if (dotCount > 3) {
            dotCount = 1;
        }
        dotsElement.textContent = '.'.repeat(dotCount);
        dotCount++;
    }, 500);
}

function stopLoadingAnimation() {
    if (dotInterval) {
        clearInterval(dotInterval);
        dotInterval = null;
    }
}

// ==================== VALIDATION ====================
function validateInputs(curlCmd, count) {
    const errors = [];
    const warnings = [];

    if (!curlCmd || curlCmd.trim().length === 0) {
        errors.push('cURL command cannot be empty');
    } else if (curlCmd.trim().length < 10) {
        errors.push('cURL command too short (min 10 characters)');
    }

    if (!curlCmd.toLowerCase().includes('http://') && !curlCmd.toLowerCase().includes('https://')) {
        errors.push('cURL command must contain URL with protocol (http:// or https://)');
    }

    if (!count || isNaN(count)) {
        errors.push('Request count must be a number');
    } else {
        const countNum = parseInt(count);
        if (countNum < 1) {
            errors.push('Request count minimum 1');
        } else if (countNum > 1000) {
            errors.push('Request count maximum 1000');
        }
        
        if (countNum > 100) {
            warnings.push(`⚠️ Large request count (${countNum}), may take a long time`);
        }
    }

    return { errors, warnings };
}

// ==================== UI HELPERS ====================
function showError(message) {
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');
    
    errorSection.style.display = 'block';
    errorMessage.textContent = message;
}

function hideError() {
    document.getElementById('errorSection').style.display = 'none';
}

function showValidations(warnings) {
    const validationSection = document.getElementById('validationSection');
    const validationList = document.getElementById('validationList');
    
    validationSection.style.display = 'block';
    validationList.innerHTML = warnings.map(w => `<li>${w}</li>`).join('');
}

function hideValidations() {
    document.getElementById('validationSection').style.display = 'none';
}

function setButtonState(text, disabled) {
    const btn = document.getElementById('btnRun');
    btn.innerText = text;
    btn.disabled = disabled;
}

function showLoading() {
    document.getElementById('loadingSection').style.display = 'block';
    startLoadingAnimation();
}

function hideLoading() {
    document.getElementById('loadingSection').style.display = 'none';
    stopLoadingAnimation();
}

function clearResults() {
    document.getElementById('resultTableBody').innerHTML = '';
    document.getElementById('resultSection').style.display = 'none';
}

// ==================== RESULTS RENDERING ====================
function getStatusColor(status) {
    if (!status) {
        return { textColor: '#c33', bgColor: '#fee' };
    }
    
    if (status >= 200 && status < 300) {
        return { textColor: '#090', bgColor: '#efe' };
    } else if (status >= 300 && status < 400) {
        return { textColor: '#066', bgColor: '#eef' };
    } else if (status >= 400 && status < 500) {
        return { textColor: '#a50', bgColor: '#fed' };
    } else if (status >= 500) {
        return { textColor: '#c33', bgColor: '#fee' };
    }
    
    return { textColor: '#666', bgColor: '#fff' };
}

function renderResultRow(result, index) {
    const row = document.createElement('tr');
    const statusCode = result.status || result.error || 'ERROR';
    const { textColor, bgColor } = getStatusColor(result.status);
    const bodyPreview = (result.body || result.error || 'N/A').substring(0, 100);
    const showEllipsis = bodyPreview.length < (result.body || '').length;
    
    row.innerHTML = `
        <td style="padding: 12px; text-align: center; font-size: 13px; border-bottom: 1px solid #ddd;">${index + 1}</td>
        <td style="padding: 12px; text-align: center; font-weight: bold; font-size: 13px; color: ${textColor}; background-color: ${bgColor}; border-bottom: 1px solid #ddd;">
            ${statusCode}
        </td>
        <td style="padding: 12px; font-family: Courier, monospace; font-size: 12px; word-break: break-all; color: #333; border-bottom: 1px solid #ddd;">
            ${bodyPreview}${showEllipsis ? '...' : ''}
        </td>
    `;
    
    return row;
}

function displayResults(data) {
    const resultSection = document.getElementById('resultSection');
    const tableBody = document.getElementById('resultTableBody');
    
    // Show results section
    resultSection.style.display = 'block';
    
    // Display summary
    document.getElementById('targetUrl').textContent = data.target;
    document.getElementById('methodType').textContent = data.method;
    document.getElementById('totalRequest').textContent = data.results.length;
    
    // Calculate success rate
    const successCount = data.results.filter(r => r.status >= 200 && r.status < 300).length;
    const successRate = ((successCount / data.results.length) * 100).toFixed(2);
    document.getElementById('successRate').textContent = `${successRate}% (${successCount}/${data.results.length})`;
    
    // Render results table
    data.results.forEach((result, index) => {
        const row = renderResultRow(result, index);
        tableBody.appendChild(row);
    });
}

// ==================== FORM SUBMISSION ====================
async function handleAttackSubmit(e) {
    e.preventDefault();
    
    const curlCmd = document.getElementById('curlInput').value;
    const countInput = document.querySelector('input[name="count"]').value;
    
    // Validate inputs
    const { errors, warnings } = validateInputs(curlCmd, countInput);
    
    // Clear previous states
    hideError();
    hideValidations();

    // Handle validation errors
    if (errors.length > 0) {
        showError(errors.join(' | '));
        clearResults();
        return;
    }

    // Show warnings if any
    if (warnings.length > 0) {
        showValidations(warnings);
    }

    // Prepare UI for request
    setButtonState('⏳ Running...', true);
    showLoading();
    clearResults();

    const formData = new FormData(e.target);
    
    try {
        const response = await fetch('/attack', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();

        if (!response.ok || data.error) {
            showError(data.error || 'Request failed');
            hideLoading();
            clearResults();
        } else if (!data.results || data.results.length === 0) {
            showError('No results returned from server');
            hideLoading();
        } else {
            hideLoading();
            hideError();
            displayResults(data);
        }
    } catch (err) {
        showError(`Connection Error: ${err.message}`);
        hideLoading();
        clearResults();
    } finally {
        setButtonState('Run Attack', false);
    }
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', function() {
    // Form submission
    const attackForm = document.getElementById('attackForm');
    if (attackForm) {
        attackForm.addEventListener('submit', handleAttackSubmit);
    }
    
    // Clear error when user starts typing
    const curlInput = document.getElementById('curlInput');
    if (curlInput) {
        curlInput.addEventListener('input', () => {
            if (curlInput.value.length > 0) {
                hideError();
            }
        });
    }
});
