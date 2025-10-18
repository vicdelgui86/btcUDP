;; Nano-Ledger: Tamper-Proof Packet Chain on Stacks
(define-data-var chain (list 32 uint) '())  ;; Hash chain

(define-public (append-hash (new-hash (buff 8)))  ;; 8-byte Blake3
    (let ((current (unwrap! (get-chain) (err u500)))
          (full-hash (sha256 new-hash)))  ;; Stacks hash
      (var-set chain (append current full-hash))
      (ok full-hash)))

(define-read-only (verify-chain (expected (buff 8)))
    (let ((last (unwrap! (element-at (var-get chain) (- (length (var-get chain)) 1)) (err u404))))
      (if (is-eq last expected) (ok u200) (err u403))))  ;; Mismatch = Ban!

;; Deploy: clarinet deploy
