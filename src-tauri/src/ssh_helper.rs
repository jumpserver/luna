use anyhow::{bail, Context, Result};
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, size};
use russh::{client, ChannelMsg, Disconnect};
use std::io::{Read, Write};
use std::sync::Arc;
use std::time::Duration;

#[derive(Default)]
struct SshClient;

impl client::Handler for SshClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Match the previous bundled helper: the JumpServer gateway is trusted.
        Ok(true)
    }
}

struct RawModeGuard;

impl Drop for RawModeGuard {
    fn drop(&mut self) {
        let _ = disable_raw_mode();
    }
}

#[derive(Debug, PartialEq)]
struct Options {
    username: String,
    host: String,
    port: u16,
    password: String,
}

fn parse_options(args: &[String]) -> Result<Options> {
    let mut positional = None;
    let mut port = 22;
    let mut password = String::new();
    let mut index = usize::from(args.first().is_some_and(|arg| arg == "ssh"));
    while index < args.len() {
        match args[index].as_str() {
            "-p" => {
                index += 1;
                port = args.get(index).context("missing value for -p")?.parse()?;
            }
            "-P" => {
                index += 1;
                password = args.get(index).context("missing value for -P")?.clone();
            }
            value if !value.starts_with('-') && positional.is_none() => {
                positional = Some(value.to_string());
            }
            value => bail!("unsupported SSH helper argument: {value}"),
        }
        index += 1;
    }

    let destination = positional.context("missing username@host")?;
    let (username, host) = destination
        .split_once('@')
        .context("destination must be username@host")?;
    Ok(Options {
        username: username.to_string(),
        host: host.to_string(),
        port,
        password,
    })
}

async fn connect(options: Options) -> Result<u32> {
    let config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(60)),
        ..Default::default()
    });
    let mut session = client::connect(config, (options.host.as_str(), options.port), SshClient)
        .await
        .context("connect to SSH gateway")?;
    let auth = session
        .authenticate_password(options.username, options.password)
        .await
        .context("authenticate SSH session")?;
    if !auth.success() {
        bail!("SSH authentication failed");
    }

    let mut channel = session.channel_open_session().await?;
    let (columns, rows) = size().unwrap_or((120, 30));
    channel
        .request_pty(
            true,
            "xterm-256color",
            columns.into(),
            rows.into(),
            0,
            0,
            &[],
        )
        .await?;
    channel.request_shell(true).await?;

    enable_raw_mode().context("enable terminal raw mode")?;
    let _raw_mode = RawModeGuard;
    let (input_tx, mut input_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(16);
    std::thread::spawn(move || {
        let mut stdin = std::io::stdin();
        let mut buffer = [0_u8; 4096];
        while let Ok(count) = stdin.read(&mut buffer) {
            if count == 0 || input_tx.blocking_send(buffer[..count].to_vec()).is_err() {
                break;
            }
        }
    });

    let mut exit_status = 0;
    loop {
        tokio::select! {
            input = input_rx.recv() => match input {
                Some(data) => channel.data(data.as_slice()).await?,
                None => channel.eof().await?,
            },
            message = channel.wait() => match message {
                Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                    std::io::stdout().write_all(&data)?;
                    std::io::stdout().flush()?;
                }
                Some(ChannelMsg::ExitStatus { exit_status: status }) => {
                    exit_status = status;
                    break;
                }
                None => break,
                _ => {}
            }
        }
    }
    session
        .disconnect(Disconnect::ByApplication, "", "English")
        .await?;
    Ok(exit_status)
}

fn run_with_args(helper_args: Vec<String>) -> ! {
    let result = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("start SSH helper runtime")
        .and_then(|runtime| {
            runtime.block_on(async { connect(parse_options(&helper_args)?).await })
        });
    match result {
        Ok(status) => std::process::exit(status as i32),
        Err(error) => {
            eprintln!("SSH connection failed: {error:#}");
            std::process::exit(1);
        }
    }
}

pub fn run_standalone() -> ! {
    let mut args = std::env::args();
    let _executable = args.next();
    run_with_args(args.collect())
}

pub fn run_if_requested() -> bool {
    let mut args = std::env::args();
    let _executable = args.next();
    if args.next().as_deref() != Some("--ssh-helper") {
        return false;
    }

    run_with_args(args.collect());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_launcher_arguments() {
        let args = ["ssh", "JMS-id@localhost", "-p", "2222", "-P", "secret"].map(String::from);
        assert_eq!(
            parse_options(&args).unwrap(),
            Options {
                username: "JMS-id".into(),
                host: "localhost".into(),
                port: 2222,
                password: "secret".into(),
            }
        );
    }
}
