"use client";
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCategory } from '@/lib/CategoryContext';
import { AnimatePresence, motion } from 'framer-motion';

interface Category {
    id: string;
    name: string;
    slug: string;
    image: string;
    glowColor: string;
    subcategories?: { id: string; name: string; image?: string }[];
}

const CATEGORIES: Category[] = [
    {
        id: 'trending',
        name: 'Trending',
        slug: 'Trending',
        image: '/category-trending.png',
        glowColor: '#FF6B35'
    },
    {
        id: 'new',
        name: 'New',
        slug: 'New',
        image: '/category-new.jpg',
        glowColor: '#10B981'
    },
    {
        id: 'earth',
        name: 'Earth',
        slug: 'Earth',
        image: '/category-earth-v2.png',
        glowColor: '#06B6D4',
        subcategories: [
            { id: 'north-america', name: 'North America', image: '/region-north-america.png' },
            { id: 'south-america', name: 'South America', image: '/region-south-america.png' },
            { id: 'europe', name: 'Europe', image: '/region-europe.jpg' },
            { id: 'asia', name: 'Asia', image: '/region-asia.png' },
            { id: 'africa', name: 'Africa', image: '/region-africa.jpg' },
            { id: 'oceania', name: 'Oceania', image: '/region-oceania.png' }
        ]
    },
    {
        id: 'crypto',
        name: 'Crypto',
        slug: 'Crypto',
        image: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=600&q=80',
        glowColor: '#F59E0B'
    },
    {
        id: 'politics',
        name: 'Politics',
        slug: 'Politics',
        image: '/category-politics.jpg',
        glowColor: '#3B82F6'
    },
    {
        id: 'sports',
        name: 'Sports',
        slug: 'Sports',
        image: '/category-sports.png',
        glowColor: '#EC4899'
    },
    {
        id: 'trenches',
        name: 'Trenches',
        slug: 'Trenches',
        image: '/trenches-header.png',
        glowColor: '#84CC16'
    },
    {
        id: 'movies',
        name: 'Movies',
        slug: 'Movies',
        image: '/category-movies.png',
        glowColor: '#E50914'
    },
    {
        id: 'culture',
        name: 'Culture',
        slug: 'Culture',
        image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80',
        glowColor: '#EC4899'
    },
    {
        id: 'tech',
        name: 'Tech',
        slug: 'Tech',
        image: '/category-tech.png',
        glowColor: '#8B5CF6'
    },
    {
        id: 'ai',
        name: 'AI',
        slug: 'AI',
        image: '/category-ai-v2.png',
        glowColor: '#06B6D4'
    },
    {
        id: 'science',
        name: 'Science',
        slug: 'Science',
        image: '/category-science.png',
        glowColor: '#14B8A6'
    },
    {
        id: 'finance',
        name: 'Finance',
        slug: 'Finance',
        image: '/category-finance.png',
        glowColor: '#22C55E'
    },
    {
        id: 'climate',
        name: 'Climate',
        slug: 'Climate',
        image: '/category-climate.png',
        glowColor: '#10B981'
    },
    {
        id: 'mentions',
        name: 'Mentions',
        slug: 'Mentions',
        image: '/category-mentions.png',
        glowColor: '#F492B7'
    },
    {
        id: 'gaming',
        name: 'Gaming',
        slug: 'Gaming',
        image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=80',
        glowColor: '#A855F7'
    },
    {
        id: 'music',
        name: 'Music',
        slug: 'Music',
        image: '/category-music.png',
        glowColor: '#EC4899'
    }
];

export default function CategoryMegaMenu() {
    const { setActiveCategory, setActiveSubcategory, activeCategory } = useCategory();
    const router = useRouter();

    const handleCategoryClick = (category: Category) => {
        // Special routing for Crypto category -> Majors page
        if (category.id === 'crypto') {
            router.push('/crypto/majors');
            return;
        }
        setActiveCategory(category.slug);
        setActiveSubcategory('');
    };

    const handleSubcategoryClick = (categorySlug: string, subcategory: string) => {
        setActiveCategory(categorySlug);
        setActiveSubcategory(subcategory);
    };

    return (
        <div className="relative">
            {/* Trigger Bar - Compact Category Pills - Horizontal Scroll */}
            <div className="flex items-center gap-6 overflow-x-auto no-scrollbar py-3 px-6 md:px-12 bg-black w-full text-left">
                <style jsx>{`
                    .no-scrollbar::-webkit-scrollbar { display: none; }
                    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                `}</style>
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => handleCategoryClick(cat)}
                        className={`
                            shrink-0 text-[13px] font-bold lowercase tracking-wide whitespace-nowrap
                            transition-all duration-200 relative
                            ${activeCategory === cat.slug
                                ? 'text-white'
                                : 'text-gray-600 hover:text-gray-300'
                            }
                        `}
                    >
                        {cat.name.toLowerCase()}
                        {activeCategory === cat.slug && (
                            <motion.div
                                layoutId="category-underline"
                                className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full"
                                style={{ backgroundColor: cat.glowColor }}
                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
