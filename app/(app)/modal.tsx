import { useEffect, useState } from "react";
import { View, ScrollView, Clipboard, Pressable } from "react-native";

import { H1, Muted } from "@/components/ui/typography";
import { Text } from "@/components/ui/text";
import { supabase } from "@/config/supabase";
import { useSupabase } from "@/context/supabase-provider";

type Topic = {
	id: number;
	topic: string;
	created_at: string;
};

export default function Modal() {
	const [topics, setTopics] = useState<Topic[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [copiedId, setCopiedId] = useState<number | null>(null);
	const { user } = useSupabase();

	useEffect(() => {
		fetchTopics();
	}, []);

	const fetchTopics = async () => {
		try {
			if (!user) return;

			const { data, error } = await supabase
				.from('topics')
				.select('*')
				.eq('user_id', user.id)
				.order('created_at', { ascending: false });

			if (error) {
				console.error("Error fetching topics:", error);
				return;
			}

			setTopics(data || []);
		} catch (error) {
			console.error("Error:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const copyToClipboard = async (topic: string, id: number) => {
		await Clipboard.setString(topic);
		setCopiedId(id);
		setTimeout(() => setCopiedId(null), 2000); // Reset after 2 seconds
	};

	return (
		<View className="flex flex-1 bg-background p-4">
			<H1 className="text-center mb-4">Your Topics</H1>
			{isLoading ? (
				<Text className="text-center">Loading topics...</Text>
			) : topics.length === 0 ? (
				<Muted className="text-center">No topics yet. Generate some topics!</Muted>
			) : (
				<ScrollView className="flex-1">
					<View className="gap-y-4">
						{topics.map((topic) => (
							<Pressable
								key={topic.id}
								onLongPress={() => copyToClipboard(topic.topic, topic.id)}
								className={`p-4 rounded-lg border border-border bg-card ${
									copiedId === topic.id ? 'bg-primary/10' : ''
								}`}
							>
								<Text className="text-card-foreground">{topic.topic}</Text>
								{copiedId === topic.id && (
									<Text className="text-xs text-primary mt-2">
										Copied to clipboard!
									</Text>
								)}
							</Pressable>
						))}
					</View>
				</ScrollView>
			)}
		</View>
	);
}
