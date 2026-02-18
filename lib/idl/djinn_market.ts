export type DjinnMarket = {
    "version": "0.1.0",
    "name": "djinn_market",
    "instructions": [
        {
            "name": "initializeProtocol",
            "accounts": [
                {
                    "name": "protocolState",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "authority",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "treasury",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": []
        },
        {
            "name": "createMarket",
            "accounts": [
                {
                    "name": "market",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "protocolState",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "creator",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "protocolTreasury",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "title",
                    "type": "string"
                },
                {
                    "name": "description",
                    "type": "string"
                },
                {
                    "name": "resolutionTime",
                    "type": "i64"
                }
            ]
        },
        {
            "name": "placeTrade",
            "accounts": [
                {
                    "name": "market",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "position",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "protocolState",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "trader",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "marketCreator",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "protocolTreasury",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "yesTokenMint",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "noTokenMint",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "traderYesAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "traderNoAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "tokenProgram",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "outcome",
                    "type": "bool"
                },
                {
                    "name": "amount",
                    "type": "u64"
                }
            ]
        },
        {
            "name": "resolveMarket",
            "accounts": [
                {
                    "name": "market",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "protocolState",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "authority",
                    "isMut": false,
                    "isSigner": true
                },
                {
                    "name": "protocolTreasury",
                    "isMut": true,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "winningOutcome",
                    "type": "bool"
                }
            ]
        },
        {
            "name": "redeem",
            "accounts": [
                {
                    "name": "market",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "position",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "user",
                    "isMut": true,
                    "isSigner": true
                }
            ],
            "args": []
        }
    ],
    "accounts": [
        {
            "name": "protocolState",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "authority",
                        "type": "publicKey"
                    },
                    {
                        "name": "treasury",
                        "type": "publicKey"
                    },
                    {
                        "name": "totalMarkets",
                        "type": "u64"
                    },
                    {
                        "name": "totalVolume",
                        "type": "u64"
                    },
                    {
                        "name": "totalFeesCollected",
                        "type": "u64"
                    }
                ]
            }
        },
        {
            "name": "market",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "creator",
                        "type": "publicKey"
                    },
                    {
                        "name": "protocolAuthority",
                        "type": "publicKey"
                    },
                    {
                        "name": "title",
                        "type": "string"
                    },
                    {
                        "name": "description",
                        "type": "string"
                    },
                    {
                        "name": "yesPool",
                        "type": "u64"
                    },
                    {
                        "name": "noPool",
                        "type": "u64"
                    },
                    {
                        "name": "totalYesShares",
                        "type": "u64"
                    },
                    {
                        "name": "totalNoShares",
                        "type": "u64"
                    },
                    {
                        "name": "resolutionTime",
                        "type": "i64"
                    },
                    {
                        "name": "resolved",
                        "type": "bool"
                    },
                    {
                        "name": "winningOutcome",
                        "type": {
                            "option": "bool"
                        }
                    },
                    {
                        "name": "creationFeePaid",
                        "type": "u64"
                    },
                    {
                        "name": "bump",
                        "type": "u8"
                    }
                ]
            }
        },
        {
            "name": "position",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "user",
                        "type": "publicKey"
                    },
                    {
                        "name": "market",
                        "type": "publicKey"
                    },
                    {
                        "name": "yesShares",
                        "type": "u64"
                    },
                    {
                        "name": "noShares",
                        "type": "u64"
                    }
                ]
            }
        }
    ],
    "types": [
        {
            "name": "ProtocolState",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "authority",
                        "type": "publicKey"
                    },
                    {
                        "name": "treasury",
                        "type": "publicKey"
                    },
                    {
                        "name": "totalMarkets",
                        "type": "u64"
                    },
                    {
                        "name": "totalVolume",
                        "type": "u64"
                    },
                    {
                        "name": "totalFeesCollected",
                        "type": "u64"
                    }
                ]
            }
        },
        {
            "name": "Market",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "creator",
                        "type": "publicKey"
                    },
                    {
                        "name": "protocolAuthority",
                        "type": "publicKey"
                    },
                    {
                        "name": "title",
                        "type": "string"
                    },
                    {
                        "name": "description",
                        "type": "string"
                    },
                    {
                        "name": "yesPool",
                        "type": "u64"
                    },
                    {
                        "name": "noPool",
                        "type": "u64"
                    },
                    {
                        "name": "totalYesShares",
                        "type": "u64"
                    },
                    {
                        "name": "totalNoShares",
                        "type": "u64"
                    },
                    {
                        "name": "resolutionTime",
                        "type": "i64"
                    },
                    {
                        "name": "resolved",
                        "type": "bool"
                    },
                    {
                        "name": "winningOutcome",
                        "type": {
                            "option": "bool"
                        }
                    },
                    {
                        "name": "creationFeePaid",
                        "type": "u64"
                    },
                    {
                        "name": "bump",
                        "type": "u8"
                    }
                ]
            }
        },
        {
            "name": "Position",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "user",
                        "type": "publicKey"
                    },
                    {
                        "name": "market",
                        "type": "publicKey"
                    },
                    {
                        "name": "yesShares",
                        "type": "u64"
                    },
                    {
                        "name": "noShares",
                        "type": "u64"
                    }
                ]
            }
        }
    ],
    "errors": [
        {
            "code": 6000,
            "name": "TitleTooLong",
            "msg": "Title too long (max 200 characters)"
        },
        {
            "code": 6001,
            "name": "DescriptionTooLong",
            "msg": "Description too long (max 1000 characters)"
        },
        {
            "code": 6002,
            "name": "InvalidResolutionTime",
            "msg": "Invalid resolution time"
        },
        {
            "code": 6003,
            "name": "MarketResolved",
            "msg": "Market already resolved"
        },
        {
            "code": 6004,
            "name": "InvalidAmount",
            "msg": "Invalid amount"
        },
        {
            "code": 6005,
            "name": "TradingClosed",
            "msg": "Trading is closed"
        },
        {
            "code": 6006,
            "name": "AlreadyResolved",
            "msg": "Market already resolved"
        },
        {
            "code": 6007,
            "name": "Unauthorized",
            "msg": "Unauthorized"
        },
        {
            "code": 6008,
            "name": "TooEarly",
            "msg": "Too early to resolve"
        },
        {
            "code": 6009,
            "name": "NotResolved",
            "msg": "Market not resolved yet"
        },
        {
            "code": 6010,
            "name": "NoWinningShares",
            "msg": "No winning shares to redeem"
        }
    ],
    "metadata": {
        "address": "BFgyP2Hba1kD6ZgzusZgSMuYmxnb6C1ne78sxvWxAHGk"
    }
};

export const IDL: DjinnMarket = {
    "version": "0.1.0",
    "name": "djinn_market",
    "instructions": [
        {
            "name": "initializeProtocol",
            "accounts": [
                {
                    "name": "protocolState",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "authority",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "treasury",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": []
        },
        {
            "name": "createMarket",
            "accounts": [
                {
                    "name": "market",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "protocolState",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "creator",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "protocolTreasury",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "title",
                    "type": "string"
                },
                {
                    "name": "description",
                    "type": "string"
                },
                {
                    "name": "resolutionTime",
                    "type": "i64"
                }
            ]
        },
        {
            "name": "placeTrade",
            "accounts": [
                {
                    "name": "market",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "position",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "protocolState",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "trader",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "marketCreator",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "protocolTreasury",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "yesTokenMint",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "noTokenMint",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "traderYesAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "traderNoAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "tokenProgram",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "outcome",
                    "type": "bool"
                },
                {
                    "name": "amount",
                    "type": "u64"
                }
            ]
        },
        {
            "name": "resolveMarket",
            "accounts": [
                {
                    "name": "market",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "protocolState",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "authority",
                    "isMut": false,
                    "isSigner": true
                },
                {
                    "name": "protocolTreasury",
                    "isMut": true,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "winningOutcome",
                    "type": "bool"
                }
            ]
        },
        {
            "name": "redeem",
            "accounts": [
                {
                    "name": "market",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "position",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "user",
                    "isMut": true,
                    "isSigner": true
                }
            ],
            "args": []
        }
    ],
    "accounts": [
        {
            "name": "protocolState",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "authority",
                        "type": "publicKey"
                    },
                    {
                        "name": "treasury",
                        "type": "publicKey"
                    },
                    {
                        "name": "totalMarkets",
                        "type": "u64"
                    },
                    {
                        "name": "totalVolume",
                        "type": "u64"
                    },
                    {
                        "name": "totalFeesCollected",
                        "type": "u64"
                    }
                ]
            }
        },
        {
            "name": "market",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "creator",
                        "type": "publicKey"
                    },
                    {
                        "name": "protocolAuthority",
                        "type": "publicKey"
                    },
                    {
                        "name": "title",
                        "type": "string"
                    },
                    {
                        "name": "description",
                        "type": "string"
                    },
                    {
                        "name": "yesPool",
                        "type": "u64"
                    },
                    {
                        "name": "noPool",
                        "type": "u64"
                    },
                    {
                        "name": "totalYesShares",
                        "type": "u64"
                    },
                    {
                        "name": "totalNoShares",
                        "type": "u64"
                    },
                    {
                        "name": "resolutionTime",
                        "type": "i64"
                    },
                    {
                        "name": "resolved",
                        "type": "bool"
                    },
                    {
                        "name": "winningOutcome",
                        "type": {
                            "option": "bool"
                        }
                    },
                    {
                        "name": "creationFeePaid",
                        "type": "u64"
                    },
                    {
                        "name": "bump",
                        "type": "u8"
                    }
                ]
            }
        },
        {
            "name": "position",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "user",
                        "type": "publicKey"
                    },
                    {
                        "name": "market",
                        "type": "publicKey"
                    },
                    {
                        "name": "yesShares",
                        "type": "u64"
                    },
                    {
                        "name": "noShares",
                        "type": "u64"
                    }
                ]
            }
        }
    ],
    "types": [
        {
            "name": "ProtocolState",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "authority",
                        "type": "publicKey"
                    },
                    {
                        "name": "treasury",
                        "type": "publicKey"
                    },
                    {
                        "name": "totalMarkets",
                        "type": "u64"
                    },
                    {
                        "name": "totalVolume",
                        "type": "u64"
                    },
                    {
                        "name": "totalFeesCollected",
                        "type": "u64"
                    }
                ]
            }
        },
        {
            "name": "Market",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "creator",
                        "type": "publicKey"
                    },
                    {
                        "name": "protocolAuthority",
                        "type": "publicKey"
                    },
                    {
                        "name": "title",
                        "type": "string"
                    },
                    {
                        "name": "description",
                        "type": "string"
                    },
                    {
                        "name": "yesPool",
                        "type": "u64"
                    },
                    {
                        "name": "noPool",
                        "type": "u64"
                    },
                    {
                        "name": "totalYesShares",
                        "type": "u64"
                    },
                    {
                        "name": "totalNoShares",
                        "type": "u64"
                    },
                    {
                        "name": "resolutionTime",
                        "type": "i64"
                    },
                    {
                        "name": "resolved",
                        "type": "bool"
                    },
                    {
                        "name": "winningOutcome",
                        "type": {
                            "option": "bool"
                        }
                    },
                    {
                        "name": "creationFeePaid",
                        "type": "u64"
                    },
                    {
                        "name": "bump",
                        "type": "u8"
                    }
                ]
            }
        },
        {
            "name": "Position",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "user",
                        "type": "publicKey"
                    },
                    {
                        "name": "market",
                        "type": "publicKey"
                    },
                    {
                        "name": "yesShares",
                        "type": "u64"
                    },
                    {
                        "name": "noShares",
                        "type": "u64"
                    }
                ]
            }
        }
    ],
    "errors": [
        {
            "code": 6000,
            "name": "TitleTooLong",
            "msg": "Title too long (max 200 characters)"
        },
        {
            "code": 6001,
            "name": "DescriptionTooLong",
            "msg": "Description too long (max 1000 characters)"
        },
        {
            "code": 6002,
            "name": "InvalidResolutionTime",
            "msg": "Invalid resolution time"
        },
        {
            "code": 6003,
            "name": "MarketResolved",
            "msg": "Market already resolved"
        },
        {
            "code": 6004,
            "name": "InvalidAmount",
            "msg": "Invalid amount"
        },
        {
            "code": 6005,
            "name": "TradingClosed",
            "msg": "Trading is closed"
        },
        {
            "code": 6006,
            "name": "AlreadyResolved",
            "msg": "Market already resolved"
        },
        {
            "code": 6007,
            "name": "Unauthorized",
            "msg": "Unauthorized"
        },
        {
            "code": 6008,
            "name": "TooEarly",
            "msg": "Too early to resolve"
        },
        {
            "code": 6009,
            "name": "NotResolved",
            "msg": "Market not resolved yet"
        },
        {
            "code": 6010,
            "name": "NoWinningShares",
            "msg": "No winning shares to redeem"
        }
    ],
    "metadata": {
        "address": "BFgyP2Hba1kD6ZgzusZgSMuYmxnb6C1ne78sxvWxAHGk"
    }
};
