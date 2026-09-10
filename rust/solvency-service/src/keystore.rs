//! Per-organisation signing seeds, encrypted at rest.
//!
//! This process is the only one that ever holds a seed. Each organisation's
//! 32-byte Ed25519 seed lives in one file, sealed with ChaCha20-Poly1305 under
//! a key-encryption key (KEK) the operator supplies through the environment,
//! with the organisation id as associated data so a file cannot be renamed
//! into another organisation's key. Swapping this module for an HSM or a cloud
//! KMS changes nothing above it: callers ask for a `ReportSigner` and get one.

use anyhow::{Context, Result, bail};
use canton_solvency_report::sign::ReportSigner;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use std::path::{Path, PathBuf};

const NONCE_LEN: usize = 12;

pub struct Keystore {
    dir: PathBuf,
    kek: Key,
}

impl Keystore {
    /// `kek_hex` is 32 bytes as 64 hex characters. Refuses anything else:
    /// a short key silently padded would be a weaker key nobody asked for.
    pub fn open(dir: impl Into<PathBuf>, kek_hex: &str) -> Result<Self> {
        let raw = hex::decode(kek_hex.trim()).context("SERVICE_KEK is not hex")?;
        if raw.len() != 32 {
            bail!(
                "SERVICE_KEK must be 32 bytes (64 hex characters), got {}",
                raw.len()
            );
        }
        let dir = dir.into();
        std::fs::create_dir_all(&dir)
            .with_context(|| format!("creating keystore directory {}", dir.display()))?;
        // Prove the directory is writable now, at startup, rather than on the
        // first key request. A Docker named volume is created root-owned
        // unless the image chowns the mount point, and this process runs as
        // an unprivileged user: that mistake surfaced in production as a 500
        // on every key request while the health check stayed green.
        let probe = dir.join(".write-test");
        std::fs::write(&probe, b"")
            .and_then(|()| std::fs::remove_file(&probe))
            .with_context(|| {
                format!(
                    "keystore directory {} is not writable by this process; chown it to the user the service runs as (the image's `canton` user)",
                    dir.display()
                )
            })?;
        Ok(Self {
            dir,
            kek: Key::try_from(raw.as_slice())
                .map_err(|_| anyhow::anyhow!("SERVICE_KEK has the wrong length"))?,
        })
    }

    fn path_for(&self, org_id: &str) -> Result<PathBuf> {
        // Ids are opaque to this service, but they become file names here.
        if org_id.is_empty()
            || !org_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            bail!("org_id must be non-empty and [A-Za-z0-9_-]");
        }
        Ok(self.dir.join(format!("{org_id}.key")))
    }

    /// The organisation's signer, creating a fresh random seed on first use.
    pub fn signer_for(&self, org_id: &str) -> Result<ReportSigner> {
        let path = self.path_for(org_id)?;
        let seed = if path.exists() {
            self.unseal(&path, org_id)?
        } else {
            let mut seed = [0u8; 32];
            rand::fill(&mut seed);
            self.seal(&path, org_id, &seed)?;
            seed
        };
        Ok(ReportSigner::from_seed(&seed))
    }

    fn seal(&self, path: &Path, org_id: &str, seed: &[u8; 32]) -> Result<()> {
        let cipher = ChaCha20Poly1305::new(&self.kek);
        let mut nonce = [0u8; NONCE_LEN];
        rand::fill(&mut nonce);
        let sealed = cipher
            .encrypt(
                &Nonce::try_from(nonce.as_slice()).expect("12 bytes"),
                Payload {
                    msg: seed,
                    aad: org_id.as_bytes(),
                },
            )
            .map_err(|_| anyhow::anyhow!("sealing the seed failed"))?;
        let mut out = Vec::with_capacity(NONCE_LEN + sealed.len());
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&sealed);
        // Write to a temporary name and rename, so a crash cannot leave a
        // half-written key that later fails to unseal.
        let tmp = path.with_extension("key.tmp");
        std::fs::write(&tmp, &out).with_context(|| format!("writing {}", tmp.display()))?;
        std::fs::rename(&tmp, path).with_context(|| format!("renaming into {}", path.display()))?;
        Ok(())
    }

    fn unseal(&self, path: &Path, org_id: &str) -> Result<[u8; 32]> {
        let bytes = std::fs::read(path).with_context(|| format!("reading {}", path.display()))?;
        if bytes.len() < NONCE_LEN + 16 {
            bail!("{} is too short to be a sealed key", path.display());
        }
        let (nonce, sealed) = bytes.split_at(NONCE_LEN);
        let cipher = ChaCha20Poly1305::new(&self.kek);
        let seed = cipher
            .decrypt(
                &Nonce::try_from(nonce).expect("12 bytes"),
                Payload {
                    msg: sealed,
                    aad: org_id.as_bytes(),
                },
            )
            .map_err(|_| {
                anyhow::anyhow!(
                    "could not unseal {}: wrong SERVICE_KEK, or the file was altered",
                    path.display()
                )
            })?;
        let mut out = [0u8; 32];
        if seed.len() != 32 {
            bail!("unsealed seed has the wrong length");
        }
        out.copy_from_slice(&seed);
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEK: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn a_key_is_stable_across_calls_and_reopenings() {
        let dir = tempfile::tempdir().unwrap();
        let a = Keystore::open(dir.path(), KEK).unwrap();
        let first = a.signer_for("org-1").unwrap().public_key_hex();
        let again = a.signer_for("org-1").unwrap().public_key_hex();
        assert_eq!(first, again);
        let b = Keystore::open(dir.path(), KEK).unwrap();
        assert_eq!(b.signer_for("org-1").unwrap().public_key_hex(), first);
    }

    #[test]
    fn two_organisations_get_two_keys() {
        let dir = tempfile::tempdir().unwrap();
        let ks = Keystore::open(dir.path(), KEK).unwrap();
        assert_ne!(
            ks.signer_for("org-1").unwrap().public_key_hex(),
            ks.signer_for("org-2").unwrap().public_key_hex()
        );
    }

    #[test]
    fn a_wrong_kek_refuses_to_unseal() {
        let dir = tempfile::tempdir().unwrap();
        Keystore::open(dir.path(), KEK)
            .unwrap()
            .signer_for("org-1")
            .unwrap();
        let other = Keystore::open(dir.path(), &"ff".repeat(32)).unwrap();
        let err = other
            .signer_for("org-1")
            .map(|_| ())
            .unwrap_err()
            .to_string();
        assert!(err.contains("wrong SERVICE_KEK"), "{err}");
    }

    #[test]
    fn a_key_file_cannot_be_renamed_into_another_organisation() {
        let dir = tempfile::tempdir().unwrap();
        let ks = Keystore::open(dir.path(), KEK).unwrap();
        ks.signer_for("org-1").unwrap();
        std::fs::rename(dir.path().join("org-1.key"), dir.path().join("org-2.key")).unwrap();
        assert!(ks.signer_for("org-2").is_err());
    }

    #[test]
    fn rejects_a_short_kek_and_an_unsafe_id() {
        let dir = tempfile::tempdir().unwrap();
        assert!(Keystore::open(dir.path(), "abcd").is_err());
        let ks = Keystore::open(dir.path(), KEK).unwrap();
        assert!(ks.signer_for("../etc").is_err());
        assert!(ks.signer_for("").is_err());
    }

    #[test]
    #[cfg(unix)]
    fn open_refuses_a_directory_it_cannot_write() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let ro = dir.path().join("ro");
        std::fs::create_dir(&ro).unwrap();
        std::fs::set_permissions(&ro, std::fs::Permissions::from_mode(0o555)).unwrap();
        if std::fs::write(ro.join("probe"), b"").is_ok() {
            return; // running as root, which writes anywhere; nothing to exercise
        }
        let err = Keystore::open(&ro, &"ab".repeat(32))
            .err()
            .expect("must refuse");
        let text = format!("{err:#}");
        assert!(text.contains("not writable"), "{text}");
        assert!(text.contains("chown"), "{text}");
    }
}
