from flask import Flask, render_template, request, jsonify
import httpx
import asyncio
import re

app = Flask(__name__)

@app.after_request
def set_security_headers(response):
   
   
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.tailwindcss.com; "
        "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; "
        "img-src 'self' data:; "
        "font-src 'self' data:; "
        "connect-src 'self';"
    )
    
   
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    
    return response


# ==================== VALIDATION FUNCTIONS ====================

def validate_curl_command(curl_raw):
    """Validate cURL command input"""
    if not curl_raw:
        return False, "cURL command cannot be empty"
    
    if len(curl_raw) < 10:
        return False, "cURL command too short (min 10 characters)"
    
    if not curl_raw.lower().startswith('curl'):
        return False, "Not a valid curl command"
    
    return True, None


def validate_count(count_input):
    """Validate count parameter"""
    if not count_input:
        return False, "Parameter 'count' must be provided", None
    
    try:
        count = int(count_input)
    except ValueError:
        return False, f"count must be a number, not '{count_input}'", None
    
    if count <= 0:
        return False, "count must be greater than 0 (minimum 1)", None
    
    if count > 1000:
        return False, f"count maximum 1000, you entered {count}", None
    
    return True, None, count


def validate_url(url):
    """Validate parsed URL"""
    if not url:
        return False, "URL not found in curl command. Make sure curl contains URL with http:// or https://"
    
    if "://" not in url:
        return False, f"Invalid URL: {url}. Must start with http:// or https://"
    
    return True, None


# ==================== PARSING FUNCTIONS ====================

def normalize_curl(curl_raw):
    """Normalize shell syntax in curl command"""
    curl_raw = re.sub(r"\$'", "'", curl_raw)
    return curl_raw


def parse_curl_advanced(curl_raw):
    """Parse cURL command and extract method, URL, headers, and data"""
    curl_raw = normalize_curl(curl_raw)
    curl_raw = curl_raw.replace("\\\n", " ").replace("\n", " ").strip()
    

    url = ""
    url_patterns = [
        r"['\"]?(https?://[^\s'\"]+)['\"]?\s*$",
        r"(https?://[^\s'\"]+)",
    ]
    
    for pattern in url_patterns:
        url_match = re.search(pattern, curl_raw)
        if url_match:
            url = url_match.group(1).strip("'\"")
            if url and "://" in url:
                break
    
   
    method_match = re.search(r"-X\s+['\"]?([A-Z]+)['\"]?", curl_raw)
    method = method_match.group(1) if method_match else "GET"
    
   
    headers = {}
    header_pattern = r"-H\s+['\"]([^'\"]+?):\s*([^'\"]*?)['\"]"
    for match in re.finditer(header_pattern, curl_raw):
        key = match.group(1).strip()
        val = match.group(2).strip()
        if key and val:
            headers[key] = val
    
    
    data = None
    data_start = curl_raw.find("--data-binary")
    if data_start == -1:
        data_start = curl_raw.find("--data")
    
    if data_start != -1:
        rest = curl_raw[data_start:]
        quote_idx = -1
        quote_char = None
        for i in range(len(rest)):
            if rest[i] in ("'", '"'):
                quote_char = rest[i]
                quote_idx = i
                break
        
        if quote_idx != -1:
            close_idx = rest.find(quote_char, quote_idx + 1)
            if close_idx != -1:
                data = rest[quote_idx + 1:close_idx]
                data = data.replace('\\"', '"').replace("\\'", "'")
    
    class ParseContext:
        pass
    
    ctx = ParseContext()
    ctx.method = method
    ctx.url = url
    ctx.headers = headers
    ctx.data = data
    
    return ctx


def sanitize_headers(headers):
    """Remove problematic headers"""
    if not isinstance(headers, dict):
        headers = {}
    
    headers.pop('Content-Length', None)
    headers.pop('Accept-Encoding', None)
    
    return headers


# ==================== RACE CONDITION EXECUTION ====================

async def race_worker(client, method, url, headers, data):
    """Execute single HTTP request"""
    try:
        if method.upper() == "GET":
            response = await client.get(url, headers=headers)
        else:
            response = await client.request(method, url, headers=headers, content=data)
        
        return {"status": response.status_code, "body": response.text[:200]}
    except Exception as e:
        return {"error": str(e)}


async def execute_race_condition(method, url, headers, data, count):
    """Execute race condition attack with concurrent requests"""
    try:
        async with httpx.AsyncClient(http2=True, verify=False, timeout=30.0) as client:
            tasks = [race_worker(client, method, url, headers, data) for _ in range(count)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            cleaned_results = []
            for result in results:
                if isinstance(result, Exception):
                    cleaned_results.append({
                        "status": None,
                        "body": f"Error: {str(result)[:100]}"
                    })
                else:
                    cleaned_results.append(result)
            
            return cleaned_results
    except Exception as e:
        raise Exception(f"Race condition execution error: {str(e)}")


# ==================== ROUTES ====================

@app.route('/')
def index():
    """Render main page"""
    return render_template('index.html')


@app.route('/attack', methods=['POST'])
def run_attack():
    """Handle race condition attack request"""
    try:
        # Get form data
        curl_raw = request.form.get('curl_command', '').strip()
        count_input = request.form.get('count', '')

        
        is_valid, error_msg = validate_curl_command(curl_raw)
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        
        is_valid, error_msg, count = validate_count(count_input)
        if not is_valid:
            return jsonify({"error": error_msg}), 400
        
       
        parsed_context = parse_curl_advanced(curl_raw)
        
       
        is_valid, error_msg = validate_url(parsed_context.url)
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        
        method = parsed_context.method
        url = parsed_context.url
        headers = sanitize_headers(parsed_context.headers)
        data = parsed_context.data

       
        results = asyncio.run(execute_race_condition(method, url, headers, data, count))
        
        if not results:
            return jsonify({"error": "No results returned"}), 400

        return jsonify({
            "target": url,
            "method": method,
            "results": results
        })

    except ValueError as e:
        return jsonify({"error": f"Invalid value: {str(e)}"}), 400
    except asyncio.TimeoutError:
        return jsonify({"error": "Request timeout - server too slow (>30 seconds)"}), 504
    except Exception as e:
        error_msg = str(e)
        if "Connection" in error_msg or "Timeout" in error_msg:
            return jsonify({"error": f"Network error: {error_msg[:100]}"}), 503
        return jsonify({"error": f"Parse/Execution error: {error_msg[:100]}"}), 400


# ==================== MAIN ====================

if __name__ == '__main__':
    app.run(debug=True, port=5000)