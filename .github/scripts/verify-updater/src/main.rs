use minisign_verify::{PublicKey, Signature};

fn verify() -> Result<(), Box<dyn std::error::Error>> {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    if arguments.len() != 3 {
        return Err("Expected public-key file, decoded signature file, updater bundle".into());
    }
    let public_key = PublicKey::from_file(&arguments[0])?;
    let signature = Signature::from_file(&arguments[1])?;
    let contents = std::fs::read(&arguments[2])?;
    public_key.verify(&contents, &signature, false)?;
    Ok(())
}

fn main() {
    if let Err(error) = verify() {
        eprintln!("Updater signature verification failed: {error}");
        std::process::exit(1);
    }
    println!("Updater signature verified against the application's existing public key.");
}
