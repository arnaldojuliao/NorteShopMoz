package mz.norteshopmoz.api.repository;

import mz.norteshopmoz.api.domain.Category;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<Category, String> {}
