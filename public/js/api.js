(function() {
    const apiBaseUrl = '/api';

    async function request(endpoint, options = {}) {
        const url = `${apiBaseUrl}${endpoint}`;
        
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // If body is FormData, let the browser set the Content-Type automatically
        if (options.body instanceof FormData) {
            delete defaultHeaders['Content-Type'];
        }

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        try {
            if (window.showLoader && options.showLoader !== false) {
                window.showLoader();
            }

            const response = await fetch(url, config);
            
            if (options.download) {
                if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
                return await response.blob();
            }

            // Handle NO_CONTENT responses gracefully
            if (response.status === 204) {
                return null;
            }

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const errorMessage = data.message || data.error || `Errore ${response.status}: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            if (window.showToast) {
                window.showToast(error.message || 'Si è verificato un errore di rete', 'error');
                error._toasted = true;
            }
            throw error;
        } finally {
            if (window.hideLoader && options.showLoader !== false) {
                window.hideLoader();
            }
        }
    }

    window.api = {
        get: (endpoint, options = {}) => request(endpoint, { method: 'GET', ...options }),
        post: (endpoint, body, options = {}) => request(endpoint, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body), ...options }),
        put: (endpoint, body, options = {}) => request(endpoint, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body), ...options }),
        delete: (endpoint, options = {}) => request(endpoint, { method: 'DELETE', ...options }),
        upload: (endpoint, formData, options = {}) => request(endpoint, { method: 'POST', body: formData, ...options }),
        download: (endpoint, options = {}) => request(endpoint, { method: 'GET', download: true, ...options })
    };
})();
