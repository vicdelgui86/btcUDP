// File: src/contract/nano-ledger.clar
(define-data-var packet-chain (map uint uint))

(define-public (anchor (hash uint) (prev uint))
  (begin
    (map-set packet-chain hash prev)
    (ok true)
  )
)

(define-read-only (verify (hash uint) (prev uint))
  (let ((stored (default-to u0 (map-get? packet-chain hash))))
    (ok (is-eq stored prev))
  )
)


