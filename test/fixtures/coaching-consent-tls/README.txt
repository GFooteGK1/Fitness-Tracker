Public, disposable test-only TLS pair for the loopback consent browser fixture.
The private key is intentionally public and confers no Socius/provider authority.
Never install this certificate as a trusted root or use this pair in production.
Fresh test contexts ignore its trust error only while all browser DNS is mapped
onto the loopback fixture. No system/browser profile trust settings are modified.
Generated using existing Git OpenSSL for synthetic real-browser header tests.
