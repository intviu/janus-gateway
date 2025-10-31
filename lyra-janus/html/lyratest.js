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
function makeLyraEncodeTransform() {
	return new TransformStream({
		start() {
			console.log("[Lyra encode transform] Startup");
		},
		transform(chunk, controller) {
			// Input payload for negotiated L16 is big-endian PCM (network byte order).
			// Swap to little-endian before viewing as Int16Array in JS.
			let bytes = new Uint8Array(chunk.data);
			for (let i = 0; i < bytes.length; i += 2) {
				let b0 = bytes[i];
				bytes[i] = bytes[i + 1];
				bytes[i + 1] = b0;
			}
			let samples = new Int16Array(chunk.data);
			let buffer = new Float32Array(samples.length);
			for (let i = 0; i < samples.length; i++) {
				buffer[i] = samples[i] / 32768.0;
			}
			let encoded = encodeWithLyra(buffer, 16000);
			// Done
			chunk.data = encoded.buffer;
			controller.enqueue(chunk);
		},
		flush() {
			console.log("[Lyra encode transform] Closing");
		}
	});
}

function makeLyraDecodeTransform() {
	return new TransformStream({
		start() {
			console.log("[Lyra decode transform] Startup");
		},
		transform(chunk, controller) {
			// Decode the Lyra audio to uncompressed audio (L16), so that
			// we can play back the incoming Lyra stream
			let encoded = new Uint8Array(chunk.data);
			let decoded = decodeWithLyra(encoded, 16000, 320);
			// Convert Float32 [-1,1] to Int16 with proper asymmetry and clamp
			let samples = new Int16Array(decoded.length);
			for (let i = 0; i < decoded.length; i++) {
				let v = Math.max(-1.0, Math.min(1.0, decoded[i]));
				samples[i] = v < 0 ? (v * 0x8000) : (v * 0x7FFF);
			}
			// Convert to big-endian for L16 payload back into the pipeline
			let out = new Uint8Array(samples.buffer.slice(0));
			for (let i = 0; i < out.length; i += 2) {
				let b0 = out[i];
				out[i] = out[i + 1];
				out[i + 1] = b0;
			}
			// Done
			chunk.data = out.buffer;
			controller.enqueue(chunk);
		},
		flush() {
			console.log("[Lyra decode transform] Closing");
		}
	});
}

function createPeerConnection() {
	echotest.createOffer(
		{
			// We want bidirectional audio, and since we want to use
			// Insertable Streams as well to take care of Lyra, we
			// specify the transform functions to use for audio
			tracks: [
				{
					type: 'audio', capture: true, recv: true,
					// Provide fresh TransformStreams each time, to avoid locked writable errors
					transforms: {
						get sender() { return makeLyraEncodeTransform(); },
						get receiver() { return makeLyraDecodeTransform(); }
					}
				}
			],
			customizeSdp: function (jsep) {
				// We want L16 to be negotiated, so we munge the SDP
				// Manipulate the SDP to only offer L16/16000
				Janus.debug("Original SDP:", jsep.sdp);
				let mline = jsep.sdp.match(/m=audio.*RTP\/SAVPF (.*)\r\n/);
				if (mline && mline.length > 1) {
					let pt_l16 = "106";
					let new_sdp = jsep.sdp.replace(mline[1], pt_l16);
					let rtpmap_regex = /a=rtpmap:([0-9]+) (.*)\r\n/g;
					let rtcpfb_regex = /a=rtcp-fb:([0-9]+) (.*)\r\n/g;
					let fmtp_regex = /a=fmtp:([0-9]+) (.*)\r\n/g;
					new_sdp = new_sdp.replace(rtpmap_regex, "");
					new_sdp = new_sdp.replace(rtcpfb_regex, "");
					new_sdp = new_sdp.replace(fmtp_regex, "");
					let mline_end_index = new_sdp.indexOf(pt_l16) + pt_l16.length;
					let sdp_first_part = new_sdp.substring(0, mline_end_index);
					let sdp_second_part = new_sdp.substring(mline_end_index);
					sdp_first_part += `\r\na=rtpmap:${pt_l16} L16/16000`;
					jsep.sdp = sdp_first_part + sdp_second_part;
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

// Transform factories moved above; we keep no global TransformStream singletons here
