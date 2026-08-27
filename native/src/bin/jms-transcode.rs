use jumpserver_native::transcode::{
    transcode_replays_json_lines, FilenameStyle, OutputResolution, TranscodePower,
};
use serde::Deserialize;
use std::io::Read;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    tar_paths: Vec<String>,
    output_dir: String,
    filename_style: Option<FilenameStyle>,
    output_resolution: Option<OutputResolution>,
    transcode_power: Option<TranscodePower>,
}

#[tokio::main]
async fn main() {
    let mut input = String::new();
    if let Err(error) = std::io::stdin().read_to_string(&mut input) {
        fail(format!("read request failed: {error}"));
    }
    let request: Request = match serde_json::from_str(&input) {
        Ok(value) => value,
        Err(error) => fail(format!("parse request failed: {error}")),
    };
    match transcode_replays_json_lines(
        request.tar_paths,
        request.output_dir,
        request.filename_style,
        request.output_resolution,
        request.transcode_power,
    )
    .await
    {
        Ok(results) => println!(
            "{}",
            serde_json::json!({ "type": "result", "payload": results })
        ),
        Err(error) => fail(error),
    }
}

fn fail(message: String) -> ! {
    println!(
        "{}",
        serde_json::json!({ "type": "error", "message": message })
    );
    std::process::exit(1);
}
