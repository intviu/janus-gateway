// Janus server to connect to
var server = null;
if (window.location.protocol === 'http:')
	server = "http://" + window.location.hostname + ":8088/janus";
else
	server = "https://" + window.location.hostname + ":8089/janus";


// ICE servers to use
var iceServers = null;

// Let's import the lyra-js bundle: we'll check programmatically when it's ready
import { isLyraReady, encodeWithLyra, decodeWithLyra } from "https://unpkg.com/lyra-codec/dist/lyra_bundle.js";

var janus = null;
var echotest = null, loading = null;
var opaqueId = "lyratest-" + Janus.randomString(12);

var remoteTracks = {};

import { Janus } from './janus.js';

$(document).ready(function () {
	// Initialize the library (all console debuggers enabled)
	Janus.init({
		debug: "all", callback: function () {
			// Use a button to start the demo
			$('#start').removeAttr('disabled').text('Start').one('click', function () {
				$(this).attr('disabled', true).unbind('click');
				// Make sure the browser supports WebRTC
				if (!Janus.isWebrtcSupported()) {
					bootbox.alert('No WebRTC support... ');
					return;
				}
				// Make sure Insertable Streams and WebCodecs are supported too
				if (!MediaStreamTrackProcessor || !MediaStreamTrackGenerator) {
					bootbox.alert('Insertable Streams not supported by this browser...');
					return;
				}
				try {
					new MediaStreamTrackGenerator('audio');
				} catch (e) {
					bootbox.alert('Insertable Streams for audio not supported by this browser...');
					return;
				}
				if (!AudioData) {
					bootbox.alert('WebCodecs not supported by this browser...');
					return;
				}
				// Create session
				janus = new Janus(
					{
						server: server,
						iceServers: iceServers,
						success: function () {
							// Attach to EchoTest plugin
							janus.attach(
								{
									plugin: "janus.plugin.echotest",
									opaqueId: opaqueId,
									success: function (pluginHandle) {
										$('#details').remove();
										echotest = pluginHandle;
										Janus.log("Plugin attached! (" + echotest.getPlugin() + ", id=" + echotest.getId() + ")");
										$('#start').removeAttr('disabled').html("Stop")
											.click(function () {
												$(this).attr('disabled', true);
												janus.destroy();
											});
										// If the Lyra bundle isn't ready yet, show a loading prompt
										if (!isLyraReady()) {
											loading = bootbox.dialog({
												message: '<p class="text-center mb-0"><i class="fas fa-spin fa-cog"></i>' +
													'Loading lyra-js bundle, please wait...</p>',
												closeButton: false
											});
											let loadingCheck = setInterval(function () {
												if (isLyraReady()) {
													// Done, setup the PeerConnection
													loading.modal('hide');
													createPeerConnection();
												}
											}, 1000);
										} else {
											// Setup the PeerConnection
											createPeerConnection();
										}
									},
									error: function (error) {
										console.error("  -- Error attaching plugin...", error);
										bootbox.alert("Error attaching plugin... " + error);
									},
									consentDialog: function (on) {
										Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
										if (on) {
											// Darken screen and show hint
											$.blockUI({
												message: '<div><img src="up_arrow.png"/></div>',
												css: {
													border: 'none',
													padding: '15px',
													backgroundColor: 'transparent',
													color: '#aaa',
													top: '10px',
													left: (navigator.mozGetUserMedia ? '-100px' : '300px')
												}
											});
										} else {
											// Restore screen
											$.unblockUI();
										}
									},
									iceState: function (state) {
										Janus.log("ICE state changed to " + state);
									},
									mediaState: function (medium, on, mid) {
										Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium + " (mid=" + mid + ")");
									},
									webrtcState: function (on) {
										Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
										$("#audioleft").parent().unblock();
									},
									slowLink: function (uplink, lost, mid) {
										Janus.warn("Janus reports problems " + (uplink ? "sending" : "receiving") +
											" packets on mid " + mid + " (" + lost + " lost packets)");
									},
									onmessage: function (msg, jsep) {
										Janus.debug(" ::: Got a message :::", msg);
										if (jsep) {
											Janus.debug("Handling SDP as well...", jsep);
											// When using L16, Chrome will use a ptime of 10ms automatically,
											// but since the Lyra encoder needs chunks of 20ms, we munge
											// the answer by forcing the ptime to be exactly that
											jsep.sdp = jsep.sdp.replace("a=rtpmap:106 L16/16000",
												"a=rtpmap:106 L16/16000\r\na=ptime:20");
											echotest.handleRemoteJsep({ jsep: jsep });
										}
										let result = msg["result"];
										if (result) {
											if (result === "done") {
												// The plugin closed the echo test
												bootbox.alert("The Echo Test is over");
												if (spinner)
													spinner.stop();
												spinner = null;
												$('audio').remove();
												return;
											}
											// Any loss?
											let status = result["status"];
											if (status === "slow_link") {
												toastr.warning("Janus apparently missed many packets we sent, maybe we should reduce the bitrate", "Packet loss?", { timeOut: 2000 });
											}
										}
									},
									onlocaltrack: function (track, on) {
										Janus.debug("Local track " + (on ? "added" : "removed") + ":", track);
										if (echotest.webrtcStuff.pc.iceConnectionState !== "completed" &&
											echotest.webrtcStuff.pc.iceConnectionState !== "connected") {
											$("#audioleft").parent().block({
												message: '<b>Publishing...</b>',
												css: {
													border: 'none',
													backgroundColor: 'transparent',
													color: 'white'
												}
											});
										}
									},
									onremotetrack: function (track, mid, on) {
										Janus.debug("Remote track (mid=" + mid + ") " + (on ? "added" : "removed") + ":", track);
										if (!on) {
											// Track removed, get rid of the stream and the rendering
											$('#peeraudio' + mid).remove();
											delete remoteTracks[mid];
											return;
										}
										// If we're here, a new track was added
										let stream = new MediaStream([track]);
										remoteTracks[mid] = stream;
										Janus.log("Created remote audio stream:", stream);
										if ($('#peeraudio' + mid).length === 0)
											$('#audioright').append('<audio class="hide" id="peeraudio' + mid + '" autoplay playsinline/>');
										Janus.attachMediaStream($('#peeraudio' + mid).get(0), stream);
									},
									oncleanup: function () {
										Janus.log(" ::: Got a cleanup notification :::");
										$('#audioleft').empty();
										$('#audioright').empty();
										remoteTracks = {};
									}
								});
						},
						error: function (error) {
							Janus.error(error);
							bootbox.alert(error, function () {
								window.location.reload();
							});
						},
						destroyed: function () {
							window.location.reload();
						}
					});
			});
		}
	});
});

// Function we use to create a new PeerConnection: we'll munge the SDP
// to make sure L16 is negotiated, and we'll force it via an API request
function createPeerConnection() {
	echotest.createOffer(
		{
			// We want bidirectional audio, and since we want to use
			// Insertable Streams as well to take care of Lyra, we
			// specify the transform functions to use for audio
			tracks: [
				{
					type: 'audio', capture: true, recv: true,
					transforms: { sender: lyraEncodeTransform, receiver: lyraDecodeTransform }
				}
			],
			customizeSdp: function (jsep) {
				// We want L16 to be negotiated, so we munge the SDP
				jsep.sdp = jsep.sdp.replace("a=rtpmap:103 ISAC/16000", "a=rtpmap:106 L16/16000");
				// Manipulate the SDP to only offer L16/16000
				Janus.debug("Original SDP:", jsep.sdp);
				// Find the audio media line
				let mline = jsep.sdp.indexOf("m=audio ");
				if (mline !== -1) {
					let sdp_mline_start = jsep.sdp.substring(mline);
					// Find the end of the audio media section
					let next_mline = sdp_mline_start.indexOf("\r\nm=");
					let sdp_mline_part = (next_mline === -1) ? sdp_mline_start : sdp_mline_start.substring(0, next_mline);

					// Split lines
					let lines = sdp_mline_part.split('\r\n');
					let m_line_parts = lines[0].split(" ");
					// Get the format list (payload types)
					let original_formats = m_line_parts.slice(3);
					let new_formats = [];
					let pt_l16 = "106"; // Hardcode to 106 as requested
					new_formats.push(pt_l16);

					// Rebuild the m-line to only contain L16 payload type
					m_line_parts.splice(3, original_formats.length, ...new_formats);
					lines[0] = m_line_parts.join(" ");

					// Filter other rtpmap, rtcp-fb, and fmtp lines
					let new_lines = [lines[0]];
					let l16_rtpmap_found = false;
					for (let i = 1; i < lines.length; i++) {
						let line = lines[i];
						if (line.startsWith("a=rtpmap:") || line.startsWith("a=rtcp-fb:") || line.startsWith("a=fmtp:")) {
							let pt = line.split(" ")[0].split(":")[1];
							if (new_formats.includes(pt)) {
								new_lines.push(line);
								if (line.startsWith("a=rtpmap:") && line.includes("L16/16000")) {
									l16_rtpmap_found = true;
								}
							}
						} else {
							// Keep other lines
							new_lines.push(line);
						}
					}

					// If L16 rtpmap was not in the original SDP, add it now.
					if (!l16_rtpmap_found) {
						let insert_index = new_lines.findIndex(line => !line.startsWith("a=rtpmap:"));
						if (insert_index === -1) insert_index = new_lines.length;
						new_lines.splice(insert_index, 0, `a=rtpmap:${pt_l16} L16/16000`);
					}

					// Reconstruct the SDP part
					let new_sdp_part = new_lines.join('\r\n');
					jsep.sdp = jsep.sdp.substring(0, mline) + new_sdp_part + ((next_mline === -1) ? "" : jsep.sdp.substring(mline + next_mline));
					Janus.debug("Manipulated SDP:", jsep.sdp);
				}
				// Create a spinner waiting for the remote video
				$('#mixedaudio').html(
					'<div class="text-center">' +
					'	<div id="spinner" class="spinner-border" role="status">' +
					'		<span class="visually-hidden">Loading...</span>' +
					'	</div>' +
					'</div>');
			},
			success: function (jsep) {
				Janus.debug("Got SDP!", jsep);
				let body = { audio: true };
				// We forse L16 as a codec, so that it's negotiated
				body["audiocodec"] = "l16";
				echotest.send({ message: body, jsep: jsep });
			},
			error: function (error) {
				Janus.error("WebRTC error:", error);
				bootbox.alert("WebRTC error... " + error.message);
			}
		});
}

var lyraEncodeTransform = new TransformStream({
	start() {
		// Called on startup.
		console.log("[Lyra encode transform] Startup");
	},
	transform(chunk, controller) {
		// Encode the uncompressed audio (L16) with Lyra, so that
		// the RTP packets contain Lyra frames instead
		let bytes = new Uint8Array(chunk.data);
		let c;
		for (let i = 0; i < bytes.length / 2; i++) {
			c = bytes[i * 2];
			bytes[i * 2] = bytes[(i * 2) + 1];
			bytes[(i * 2) + 1] = c;
		}
		let samples = new Int16Array(chunk.data);
		let buffer = Float32Array.from(samples).map(x => x / 0x8000);
		let encoded = encodeWithLyra(buffer, 16000);
		// Done
		chunk.data = encoded.buffer;
		controller.enqueue(chunk);
	},
	flush() {
		// Called when the stream is about to be closed
		console.log("[Lyra encode transform] Closing");
	}
});

var lyraDecodeTransform = new TransformStream({
	start() {
		// Called on startup.
		console.log("[Lyra encode transform] Startup");
	},
	transform(chunk, controller) {
		// Decode the Lyra audio to uncompressed audio (L16), so that
		// we can play back the incoming Lyra stream
		let encoded = new Uint8Array(chunk.data);
		let decoded = decodeWithLyra(encoded, 16000, 320);
		let samples = Int16Array.from(decoded.map(x => (x > 0 ? x * 0x7FFF : x * 0x8000)));
		// Done
		chunk.data = samples.buffer;
		let bytes = new Uint8Array(chunk.data);
		let c;
		for (let i = 0; i < bytes.length / 2; i++) {
			c = bytes[i * 2];
			bytes[i * 2] = bytes[(i * 2) + 1];
			bytes[(i * 2) + 1] = c;
		}
		controller.enqueue(chunk);
	},
	flush() {
		// Called when the stream is about to be closed
		console.log("[Lyra encode transform] Closing");
	}
});
