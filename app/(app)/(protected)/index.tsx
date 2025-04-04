import { router } from "expo-router";
import { View, Animated, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useState, useEffect, useRef } from "react";
import { Audio } from "expo-av";
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { H1, Muted } from "@/components/ui/typography";
import { supabase } from "@/config/supabase";
import { useSupabase } from "@/context/supabase-provider";

// Access environment variable through Expo's config
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
console.log("API Key available:", !!OPENAI_API_KEY); // Will log true/false without exposing the key

// Constants for limits
const MAX_RECORDING_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
const MAX_TRANSCRIPTION_LENGTH = 100000; // 100,000 characters

export default function Home() {
	const [isLoading, setIsLoading] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [recording, setRecording] = useState<Audio.Recording | null>(null);
	const [isRecording, setIsRecording] = useState(false);
	const [transcription, setTranscription] = useState<string | null>(null);
	const [medicalNotesDisplay, setMedicalNotesDisplay] = useState<string | null>(null);
	const [recordingTime, setRecordingTime] = useState(0);
	const recordingTimer = useRef<NodeJS.Timeout | null>(null);
	const { user } = useSupabase();
	const pulseAnim = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		if (isRecording) {
			// Start recording timer
			recordingTimer.current = setInterval(() => {
				setRecordingTime(prev => {
					if (prev >= MAX_RECORDING_TIME) {
						stopRecording();
						return prev;
					}
					return prev + 1000;
				});
			}, 1000);

			Animated.loop(
				Animated.sequence([
					Animated.timing(pulseAnim, {
						toValue: 0.5,
						duration: 1000,
						useNativeDriver: true,
					}),
					Animated.timing(pulseAnim, {
						toValue: 1,
						duration: 1000,
						useNativeDriver: true,
					}),
				])
			).start();
		} else {
			// Clear recording timer
			if (recordingTimer.current) {
				clearInterval(recordingTimer.current);
				recordingTimer.current = null;
			}
			pulseAnim.setValue(1);
		}
	}, [isRecording]);

	useEffect(() => {
		return () => {
			if (recording) {
				recording.stopAndUnloadAsync();
			}
			if (recordingTimer.current) {
				clearInterval(recordingTimer.current);
			}
		};
	}, []);

	const formatTime = (ms: number) => {
		const minutes = Math.floor(ms / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	};

	const startRecording = async () => {
		try {
			// Reset display states when starting a new recording
			setTranscription(null);
			setMedicalNotesDisplay(null);
			setIsProcessing(false);
			
			await Audio.requestPermissionsAsync();
			await Audio.setAudioModeAsync({
				allowsRecordingIOS: true,
				playsInSilentModeIOS: true,
			});

			const { recording } = await Audio.Recording.createAsync(
				Audio.RecordingOptionsPresets.HIGH_QUALITY
			);
			setRecording(recording);
			setIsRecording(true);
			setRecordingTime(0);
			await recording.startAsync();
		} catch (err) {
			console.error('Failed to start recording', err);
		}
	};

	const generateTitle = async (transcription: string) => {
		try {
			const response = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${OPENAI_API_KEY}`,
				},
				body: JSON.stringify({
					model: "gpt-4o",
					messages: [
						{
							role: "system",
							content: "You are a title generator. Create a concise title (max 60 characters) that captures the essence of the given text. The title should be clear and descriptive."
						},
						{
							role: "user",
							content: transcription
						}
					],
					max_tokens: 60,
					temperature: 0.7,
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to generate title');
			}

			const data = await response.json();
			return data.choices[0].message.content.trim();
		} catch (error) {
			console.error('Error generating title:', error);
			return 'Untitled Recording';
		}
	};

	const generateMedicalNotes = async (transcription: string) => {
		try {
			const response = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${OPENAI_API_KEY}`,
				},
				body: JSON.stringify({
					model: "gpt-4o",
					messages: [
						{
							role: "system",
							content: `You are a helpful assistant that organizes text into clear and concise notes. Your task is to take the given transcript and structure it into well-organized notes. Follow these guidelines:
1. Identify the main topics and key points.
2. Group related information together logically.
3. Use clear headings or sections where appropriate.
4. Use bullet points or numbered lists for clarity when needed.
5. Ensure the notes are easy to read and understand.
6. Summarize lengthy sections concisely while retaining important details.
7. Maintain a neutral and objective tone.`
						},
						{
							role: "user",
							content: transcription
						}
					],
					temperature: 0.7,
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to generate medical notes');
			}

			const data = await response.json();
			return data.choices[0].message.content.trim();
		} catch (error) {
			console.error('Error generating medical notes:', error);
			return 'Error generating notes. Please try again.';
		}
	};

	const stopRecording = async () => {
		if (!recording) return;
		setIsProcessing(true);
		setMedicalNotesDisplay(null);
		try {
			setIsRecording(false);
			await recording.stopAndUnloadAsync();
			const uri = recording.getURI();
			console.log('Recording URI:', uri);
			
			if (uri) {
				if (Platform.OS !== 'web') {
					const fileInfo = await FileSystem.getInfoAsync(uri);
					if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > MAX_FILE_SIZE) {
						throw new Error('Recording is too large. Maximum size is 25MB.');
					}
				}

				const formData = new FormData();
				
				if (Platform.OS === 'web') {
					const response = await fetch(uri);
					const blob = await response.blob();
					formData.append('file', blob, 'recording.m4a');
				} else {
					formData.append('file', {
						uri: uri,
						type: 'audio/m4a',
						name: 'recording.m4a',
					} as any);
				}

				formData.append('model', 'whisper-1');

				const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
					method: "POST",
					headers: {
						"Authorization": `Bearer ${OPENAI_API_KEY}`,
					},
					body: formData,
				});

				if (!response.ok) {
					const errorData = await response.json();
					console.error("OpenAI Whisper API Error:", errorData);
					throw new Error(`API error: ${errorData.error?.message || 'Unknown error'}`);
				}

				const data = await response.json();
				const transcriptionText = data.text;

				if (transcriptionText.length > MAX_TRANSCRIPTION_LENGTH) {
					throw new Error('Transcription is too long. Maximum length is 100,000 characters.');
				}

				setTranscription(transcriptionText); 
				console.log('Transcription:', transcriptionText);

				if (user) {
					const title = await generateTitle(transcriptionText);
					const medicalNotes = await generateMedicalNotes(transcriptionText);
					
					setMedicalNotesDisplay(medicalNotes);

					const { error } = await supabase
						.from('transcriptions')
						.insert([
							{
								user_id: user.id,
								title: title,
								content: transcriptionText,
								medical_notes: medicalNotes,
								created_at: new Date().toISOString()
							}
						]);

					if (error) {
						console.error("Error saving transcription:", error);
					}
				}
			}

			setRecording(null);
		} catch (err) {
			console.error('Failed to process recording:', err);
			setMedicalNotesDisplay(err instanceof Error ? err.message : "Error processing recording. Please try again.");
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<SafeAreaView className="flex-1 bg-background" edges={['top']}>
			{/* Header Section */}
			<View className="p-4">
				<H1 className="text-center">Medical Note Recorder</H1>
				<Muted className="text-center mt-1">
					Record your audio to generate medical notes.
				</Muted>
			</View>

			{/* Notes Display Section - Takes remaining space */}
			<View className="flex-1">
				{isProcessing ? (
					<View className="flex-1 items-center justify-center px-4">
						<ActivityIndicator size="large" />
						<Text className="text-muted-foreground text-center mt-4">
							Processing audio and generating notes...
						</Text>
					</View>
				) : medicalNotesDisplay ? (
					<View className="flex-1 mt-2 px-4 w-full">
						<ScrollView>
							{/* Display Medical Notes */}
							<Text className="text-card-foreground">
								{medicalNotesDisplay}
							</Text>

							{/* Display Original Transcript */}
							{transcription && (
								 <View className="mt-6 pt-4 border-t border-border">
									 <Text className="text-sm font-semibold text-muted-foreground mb-2">
										 Original Transcript:
									 </Text>
									 <Text className="text-sm text-card-foreground">
										 {transcription}
									 </Text>
								 </View>
							)}
						</ScrollView>
					</View>
				) : (
					<View className="flex-1 items-center justify-center px-4">
						 <Text className="text-muted-foreground text-center">
							 Your generated notes will appear here after recording.
						</Text>
					</View>
				)}
			</View>

			{/* Buttons Section - Stays at the bottom */}
			<View className="p-4 pt-0 gap-y-4">
				<View className="items-center pt-4">
					{isRecording && (
						<Text className="text-sm text-muted-foreground mb-2">
							Recording time: {formatTime(recordingTime)}
						</Text>
					)}
					<Animated.View style={{ opacity: pulseAnim }}>
						<Button
							className="w-48"
							variant="destructive"
							size="default"
							onPress={isRecording ? stopRecording : startRecording}
							disabled={isProcessing}
						>
							<View className="flex-row items-center justify-center gap-2">
								{isRecording && (
									<View className="w-2 h-2 rounded-full bg-white" />
								)}
								<Text>{isRecording ? "Stop Recording" : "Start Recording"}</Text>
							</View>
						</Button>
					</Animated.View>
				</View>
				<Button
					className="w-full"
					variant="default"
					size="default"
					onPress={() => router.push("/(app)/transcriptions-modal")}
					disabled={isProcessing || isRecording}
				>
					<Text>All Notes</Text> 
				</Button>
			</View>
		</SafeAreaView>
	);
}
