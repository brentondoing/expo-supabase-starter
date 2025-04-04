import { View, ScrollView, Clipboard, Pressable } from "react-native";
import { H1, Muted } from "@/components/ui/typography";
import { Text } from "@/components/ui/text";
import { supabase } from "@/config/supabase";
import { useSupabase } from "@/context/supabase-provider";
import { useEffect, useState } from "react";
import Markdown from 'react-native-markdown-display';

type Transcription = {
	id: number;
	user_id: string;
	title: string;
	content: string;
	medical_notes: string;
	created_at: string;
};

export default function TranscriptionsModal() {
	const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [copiedId, setCopiedId] = useState<number | null>(null);
	const [expandedId, setExpandedId] = useState<number | null>(null);
	const { user } = useSupabase();

	useEffect(() => {
		fetchTranscriptions();
	}, []);

	const fetchTranscriptions = async () => {
		try {
			if (!user) return;

			const { data, error } = await supabase
				.from('transcriptions')
				.select('*')
				.eq('user_id', user.id)
				.order('created_at', { ascending: false });

			if (error) {
				console.error("Error fetching transcriptions:", error);
				return;
			}

			setTranscriptions(data || []);
		} catch (error) {
			console.error("Error:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const copyToClipboard = async (text: string, id: number) => {
		await Clipboard.setString(text);
		setCopiedId(id);
		setTimeout(() => setCopiedId(null), 2000); // Reset after 2 seconds
	};

	const toggleExpand = (id: number) => {
		setExpandedId(expandedId === id ? null : id);
	};

	const getPreviewText = (content: string) => {
		const firstLine = content.split('\n')[0];
		return firstLine.length > 100 
			? firstLine.substring(0, 100) + '...' 
			: firstLine;
	};

	return (
		<View className="flex flex-1 bg-background p-4">
			<H1 className="text-center mb-4">Medical Notes</H1>
			{isLoading ? (
				<Text className="text-center">Loading notes...</Text>
			) : transcriptions.length === 0 ? (
				<Muted className="text-center">No notes yet. Start recording!</Muted>
			) : (
				<ScrollView className="flex-1">
					<View className="gap-y-4">
						{transcriptions.map((transcription) => (
							<Pressable
								key={transcription.id}
								onPress={() => toggleExpand(transcription.id)}
								onLongPress={() => copyToClipboard(`${transcription.title}\n\n${transcription.medical_notes}`, transcription.id)}
								className={`p-4 rounded-lg border border-border bg-card ${
									copiedId === transcription.id ? 'bg-primary/10' : ''
								}`}
							>
								<Text className="text-lg font-semibold text-card-foreground mb-2">
									{transcription.title}
								</Text>
								<Markdown>
									{expandedId === transcription.id 
										? transcription.medical_notes 
										: getPreviewText(transcription.medical_notes)}
								</Markdown>
								{expandedId === transcription.id && (
									<View className="mt-4 pt-4 border-t border-border">
										<Text className="text-sm font-semibold text-muted-foreground mb-2">
											Original Transcript:
										</Text>
										<Markdown style={{body: {fontSize: 14}}}>{transcription.content}</Markdown>
									</View>
								)}
								<Text className="text-xs text-muted-foreground mt-2">
									{new Date(transcription.created_at).toLocaleString()}
								</Text>
								{copiedId === transcription.id && (
									<Text className="text-xs text-primary mt-2">
										Copied to clipboard!
									</Text>
								)}
								<Text className="text-xs text-muted-foreground mt-2">
									{expandedId === transcription.id ? 'Tap to collapse' : 'Tap to expand'}
								</Text>
							</Pressable>
						))}
					</View>
				</ScrollView>
			)}
		</View>
	);
} 