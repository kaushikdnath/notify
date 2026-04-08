DROP TABLE IF EXISTS `delivery_logs`;

CREATE TABLE `delivery_logs` (
  `id` varchar(36) NOT NULL,
  `notification_target_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `event_type` enum('SENT','DELIVERED','READ','FAILED') NOT NULL,
  `event_timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `delivery_logs_ibfk_1` FOREIGN KEY (`notification_target_id`) REFERENCES `notification_targets` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*Table structure for table `notification_queue` */

DROP TABLE IF EXISTS `notification_queue`;

CREATE TABLE `notification_queue` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `notification_target_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `next_attempt_at` timestamp NOT NULL,
  `attempts` int DEFAULT '0',
  `status` enum('PENDING','PROCESSING','FAILED') DEFAULT 'PENDING',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `notification_queue_ibfk_1` FOREIGN KEY (`notification_target_id`) REFERENCES `notification_targets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*Table structure for table `notification_targets` */

DROP TABLE IF EXISTS `notification_targets`;

CREATE TABLE `notification_targets` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `notification_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `user_id` varchar(300) NOT NULL,
  `email` varchar(200) DEFAULT NULL,
  `mobile` varchar(10) DEFAULT NULL,
  `status` enum('PENDING','SENT','DELIVERED','READ','FAILED') DEFAULT 'PENDING',
  `retry_count` int DEFAULT '0',
  `last_attempt_at` timestamp NULL DEFAULT NULL,
  `external_id` varchar(36) DEFAULT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_notification_user` (`notification_id`,`user_id`),
  CONSTRAINT `notification_targets_ibfk_1` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*Table structure for table `notifications` */

DROP TABLE IF EXISTS `notifications`;

CREATE TABLE `notifications` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `target` varchar(100) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `message_type` varchar(100) NOT NULL,
  `message` text NOT NULL,
  `payload_json` json DEFAULT NULL,
  `priority` enum('LOW','NORMAL','HIGH','CRITICAL') DEFAULT 'NORMAL',
  `created_by_service` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
